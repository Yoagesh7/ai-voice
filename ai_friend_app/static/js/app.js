// State
let currentCallId = null;
let callStartTime = null;
let callTimerInterval = null;
let isMuted = false;
let isCallActive = false;
let recognition = null;
let audioPlayer = new Audio();
let callTranscript = [];
let currentProfile = {};
let micRecorder = null;
let volumeCheckInterval = null;
let isUserSpeaking = false;
let silenceStart = null;
let isManualRecording = false;

// DOM Elements
const callStage = document.querySelector('.call-stage');
const startCallBtn = document.getElementById('startCallBtn');
const activeCallControls = document.getElementById('activeCallControls');
const muteBtn = document.getElementById('muteBtn');
const talkBtn = document.getElementById('talkBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatusText = document.getElementById('callStatusText');
const callTimer = document.getElementById('callTimer');
const captionBox = document.getElementById('captionBox');
const captionLabel = document.getElementById('captionLabel');
const captionText = document.getElementById('captionText');
const handsFreeToggle = document.getElementById('handsFreeToggle');
const callSubOptions = document.getElementById('callSubOptions');
const callTypeToggleBtn = document.getElementById('callTypeToggleBtn');
const inCallInputBox = document.getElementById('inCallInputBox');
const inCallTextInput = document.getElementById('inCallTextInput');
const inCallSendBtn = document.getElementById('inCallSendBtn');

// Mic Meter & Tap Speak
const micMeterContainer = document.getElementById('micMeterContainer');
const micMeterFill = document.getElementById('micMeterFill');
const micMeterLabel = document.getElementById('micMeterLabel');
const tapSpeakContainer = document.getElementById('tapSpeakContainer');
const tapSpeakBtn = document.getElementById('tapSpeakBtn');
const tapSpeakText = document.getElementById('tapSpeakText');

// Modal Elements
const postCallModal = document.getElementById('postCallModal');
const modalSummary = document.getElementById('modalSummary');
const modalMoodEmoji = document.getElementById('modalMoodEmoji');
const modalTitle = document.getElementById('modalTitle');
const newMemoriesList = document.getElementById('newMemoriesList');
const closeModalBtn = document.getElementById('closeModalBtn');

// Chat Elements
const messagesContainer = document.getElementById('messagesContainer');
const chatTextInput = document.getElementById('chatTextInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');

// Memory & Persona Elements
const memoriesList = document.getElementById('memoriesList');
const callsList = document.getElementById('callsList');
const newMemoryInput = document.getElementById('newMemoryInput');
const addMemoryBtn = document.getElementById('addMemoryBtn');
const userNameInput = document.getElementById('userNameInput');
const languageSelect = document.getElementById('languageSelect');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const personaCards = document.querySelectorAll('.persona-card');
const currentLangBadge = document.getElementById('currentLangBadge');

// =================== WAV Audio Recorder Class ===================
class NativeWavRecorder {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.processor = null;
    this.pcmBuffers = [];
    this.isRecording = false;
    this.sampleRate = 16000;
  }

  async init() {
    if (!this.mediaStream) {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.sampleRate = this.audioContext.sampleRate;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      this.pcmBuffers.push(new Float32Array(channelData));
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  start() {
    this.pcmBuffers = [];
    this.isRecording = true;
  }

  stop() {
    this.isRecording = false;
    if (this.pcmBuffers.length === 0) return null;
    return this.exportWav();
  }

  getVolume() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return Math.min(100, Math.round((sum / data.length) * 1.8));
  }

  exportWav() {
    let length = 0;
    for (let i = 0; i < this.pcmBuffers.length; i++) {
      length += this.pcmBuffers[i].length;
    }
    const merged = new Float32Array(length);
    let offset = 0;
    for (let i = 0; i < this.pcmBuffers.length; i++) {
      merged.set(this.pcmBuffers[i], offset);
      offset += this.pcmBuffers[i].length;
    }

    const targetRate = 16000;
    const downsampled = this.downsample(merged, this.sampleRate, targetRate);
    const wavBytes = this.encodeWAV(downsampled, targetRate);
    return new Blob([wavBytes], { type: 'audio/wav' });
  }

  downsample(buffer, inputRate, outputRate) {
    if (inputRate === outputRate) return buffer;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : buffer[offsetBuffer];
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return view;
  }

  close() {
    this.isRecording = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }
}

// =================== Initialization ===================
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadProfile();
  await loadMemories();
  await loadHistory();
  setupSpeechRecognition();
  setupEventListeners();
});

// Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'chat-tab') loadHistory();
      if (targetId === 'memory-tab') {
        loadMemories();
        loadHistory();
      }
    });
  });
}

// Load User & Persona Profile
async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    currentProfile = await res.json();

    document.getElementById('callFriendName').textContent = currentProfile.ai_friend_name || 'Shanthi';
    document.getElementById('chatFriendName').textContent = currentProfile.ai_friend_name || 'Shanthi';
    const btnLabel = document.getElementById('startCallBtnLabel');
    if (btnLabel) btnLabel.textContent = `Call ${currentProfile.ai_friend_name || 'Shanthi'}`;
    captionLabel.textContent = currentProfile.ai_friend_name || 'Shanthi';
    
    currentLangBadge.textContent = (currentProfile.preferred_language || 'Tanglish').toUpperCase();
    userNameInput.value = currentProfile.user_name || 'Friend';
    languageSelect.value = currentProfile.preferred_language || 'tanglish';

    // Highlight active persona card
    personaCards.forEach(card => {
      if (card.dataset.name.toLowerCase() === (currentProfile.ai_friend_name || 'shanthi').toLowerCase()) {
        card.classList.add('active');
        document.getElementById('avatarEmoji').textContent = card.dataset.emoji || '🌿';
        document.getElementById('chatFriendAvatar').textContent = card.dataset.emoji || '🌿';
      } else {
        card.classList.remove('active');
      }
    });
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// Setup Browser Speech Recognition (Fallback / Parallel)
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = currentProfile.preferred_language === 'tamil' ? 'ta-IN' : 'en-IN';

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }

    if (interim) {
      captionLabel.textContent = currentProfile.user_name || 'You';
      captionText.textContent = `"${interim}..."`;
    }

    if (final && final.trim().length > 1) {
      captionLabel.textContent = currentProfile.user_name || 'You';
      captionText.textContent = `"${final}"`;
      handleUserSpokenMessage(final.trim());
    }
  };

  recognition.onerror = () => {};
}

// Start Call Flow
async function startCall() {
  try {
    callStatusText.textContent = 'Calling...';
    callStage.classList.add('in-call');
    startCallBtn.style.display = 'none';
    activeCallControls.style.display = 'flex';
    callSubOptions.style.display = 'flex';
    tapSpeakContainer.style.display = 'flex';
    micMeterContainer.style.display = 'flex';
    callTimer.style.display = 'block';

    // Unlock audio context
    try {
      audioPlayer.play().then(() => audioPlayer.pause()).catch(() => {});
    } catch(e) {}

    // Initialize native mic recorder
    if (!micRecorder) {
      micRecorder = new NativeWavRecorder();
    }
    await micRecorder.init();

    // Start volume monitoring and VAD
    startVolumeMonitor();

    const res = await fetch('/api/call/start', { method: 'POST' });
    const data = await res.json();

    currentCallId = data.call_id;
    isCallActive = true;
    callTranscript = [];

    callStartTime = Date.now();
    startTimer();

    captionLabel.textContent = data.friend_name;
    captionText.textContent = `"${data.greeting_text}"`;
    callTranscript.push({ sender: data.friend_name, text: data.greeting_text });

    if (data.greeting_audio) {
      playAiVoice(data.greeting_audio);
    } else {
      callStatusText.textContent = 'Connected (In Call)';
      startListeningCycle();
    }
  } catch (err) {
    console.error('Call failed:', err);
    callStatusText.textContent = 'Call failed. Try again.';
    alert('Could not start call. Please check microphone permission and server.');
    resetCallUI();
  }
}

// Start Volume & Voice Activity Detection Loop
function startVolumeMonitor() {
  clearInterval(volumeCheckInterval);
  volumeCheckInterval = setInterval(() => {
    if (!micRecorder || !isCallActive || isMuted) {
      if (micMeterFill) micMeterFill.style.width = '0%';
      return;
    }

    const vol = micRecorder.getVolume();
    micMeterFill.style.width = `${Math.min(100, vol * 2.5)}%`;

    // Only do VAD if continuous hands-free is enabled and AI isn't talking and not in manual mode
    if (handsFreeToggle.checked && !isManualRecording && audioPlayer.paused) {
      const speechThreshold = 14;

      if (vol > speechThreshold) {
        if (!isUserSpeaking) {
          isUserSpeaking = true;
          silenceStart = null;
          micRecorder.start();
          micMeterLabel.textContent = 'Speaking...';
          callStatusText.textContent = 'Listening to you...';
        }
        silenceStart = null;
      } else if (isUserSpeaking) {
        // Voice was active, now checking silence
        if (!silenceStart) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > 1200) {
          // 1.2s silence reached -> finish recording and send
          isUserSpeaking = false;
          silenceStart = null;
          micMeterLabel.textContent = 'Processing...';
          const wavBlob = micRecorder.stop();
          if (wavBlob && wavBlob.size > 2000) {
            processRecordedAudio(wavBlob);
          } else {
            micMeterLabel.textContent = 'Listening...';
          }
        }
      }
    }
  }, 100);
}

function startListeningCycle() {
  if (!isCallActive || isMuted || !audioPlayer.paused) return;
  micMeterLabel.textContent = 'Listening...';
  callStatusText.textContent = 'Connected (Listening...)';

  if (recognition) {
    try {
      recognition.lang = currentProfile.preferred_language === 'tamil' ? 'ta-IN' : 'en-IN';
      recognition.start();
    } catch(e) {}
  }
}

function stopListeningCycle() {
  if (recognition) {
    try { recognition.stop(); } catch(e) {}
  }
}

// Process audio via Sarvam saaras:v3 STT
async function processRecordedAudio(wavBlob) {
  stopListeningCycle();
  callStatusText.textContent = `${currentProfile.ai_friend_name || 'Shanthi'} is listening...`;
  captionLabel.textContent = currentProfile.user_name || 'You';
  captionText.textContent = '"Transcribing your voice..."';

  try {
    const formData = new FormData();
    formData.append('file', wavBlob, 'user_speech.wav');

    const sttRes = await fetch('/api/stt', {
      method: 'POST',
      body: formData
    });
    const sttData = await sttRes.json();
    const transcript = sttData.transcript?.trim();

    if (transcript && transcript.length > 0) {
      captionText.textContent = `"${transcript}"`;
      handleUserSpokenMessage(transcript);
    } else {
      console.log('STT returned empty transcript');
      captionText.textContent = '"(I didn\'t catch that, can you repeat?)"';
      callStatusText.textContent = 'Connected (In Call)';
      if (isCallActive && handsFreeToggle.checked) startListeningCycle();
    }
  } catch (err) {
    console.error('STT upload error:', err);
    callStatusText.textContent = 'Connected (In Call)';
    if (isCallActive && handsFreeToggle.checked) startListeningCycle();
  }
}

async function handleUserSpokenMessage(text) {
  stopListeningCycle();
  callStatusText.textContent = `${currentProfile.ai_friend_name || 'Shanthi'} is thinking...`;
  callTranscript.push({ sender: currentProfile.user_name || 'You', text: text });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        call_id: currentCallId,
        audio_mode: true
      })
    });

    const data = await res.json();
    captionLabel.textContent = data.friend_name;
    captionText.textContent = `"${data.reply}"`;
    callTranscript.push({ sender: data.friend_name, text: data.reply });

    if (data.audio_base64) {
      playAiVoice(data.audio_base64);
    } else {
      callStatusText.textContent = 'Connected (In Call)';
      if (isCallActive && handsFreeToggle.checked && !isMuted) startListeningCycle();
    }
  } catch (err) {
    console.error('Error in chat:', err);
    callStatusText.textContent = 'Connected (In Call)';
    if (isCallActive && handsFreeToggle.checked && !isMuted) startListeningCycle();
  }
}

function playAiVoice(base64Audio) {
  stopListeningCycle();
  callStage.classList.add('speaking');
  callStatusText.textContent = `${currentProfile.ai_friend_name || 'Shanthi'} is speaking...`;
  if (micMeterLabel) micMeterLabel.textContent = 'AI Speaking';

  audioPlayer.src = `data:audio/wav;base64,${base64Audio}`;
  audioPlayer.play().catch(e => console.log('Autoplay audio blocked:', e));

  audioPlayer.onended = () => {
    callStage.classList.remove('speaking');
    callStatusText.textContent = 'Connected (In Call)';
    if (isCallActive && handsFreeToggle.checked && !isMuted) {
      setTimeout(() => startListeningCycle(), 350);
    }
  };
}

async function endCall() {
  if (!isCallActive) return;
  isCallActive = false;
  stopListeningCycle();
  clearInterval(volumeCheckInterval);
  if (micRecorder) micRecorder.stop();
  audioPlayer.pause();
  clearInterval(callTimerInterval);

  callStage.classList.remove('in-call', 'speaking');
  callStatusText.textContent = 'Wrapping up call...';

  const durationSec = Math.floor((Date.now() - callStartTime) / 1000);

  try {
    const res = await fetch('/api/call/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call_id: currentCallId,
        duration_sec: durationSec,
        transcript: callTranscript
      })
    });

    const data = await res.json();
    showPostCallModal(data.analysis);
  } catch (err) {
    console.error('Failed to end call:', err);
  }

  resetCallUI();
  await loadMemories();
  await loadHistory();
}

function resetCallUI() {
  isCallActive = false;
  currentCallId = null;
  startCallBtn.style.display = 'flex';
  activeCallControls.style.display = 'none';
  callSubOptions.style.display = 'none';
  tapSpeakContainer.style.display = 'none';
  micMeterContainer.style.display = 'none';
  if (inCallInputBox) inCallInputBox.style.display = 'none';
  callTimer.style.display = 'none';
  callStatusText.textContent = 'Ready to talk';
}

function startTimer() {
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    callTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

// Show Post-Call Reflection Modal
function showPostCallModal(analysis) {
  modalTitle.textContent = `Call Ended with ${currentProfile.ai_friend_name || 'Shanthi'}`;
  modalSummary.textContent = `"${analysis.summary}"`;
  
  const moodMap = {
    'happy': '😊',
    'stressed': '🫂',
    'tired': '☕',
    'sad': '❤️',
    'excited': '🎉',
    'neutral': '🌿',
    'relaxed': '🌿'
  };
  modalMoodEmoji.textContent = moodMap[analysis.mood?.toLowerCase()] || '🌿';

  newMemoriesList.innerHTML = '';
  if (analysis.new_facts && analysis.new_facts.length > 0) {
    analysis.new_facts.forEach(f => {
      const li = document.createElement('li');
      li.textContent = `• ${f.fact}`;
      newMemoriesList.appendChild(li);
    });
    document.getElementById('newMemoriesBox').style.display = 'block';
  } else {
    document.getElementById('newMemoriesBox').style.display = 'none';
  }

  postCallModal.classList.add('active');
}

// Event Listeners
function setupEventListeners() {
  if (startCallBtn) startCallBtn.addEventListener('click', startCall);
  if (endCallBtn) endCallBtn.addEventListener('click', endCall);

  // Dedicated Tap to Speak Button
  if (tapSpeakBtn) {
    tapSpeakBtn.addEventListener('click', async () => {
      if (!isCallActive || !micRecorder) return;

      if (!isManualRecording) {
        // Start manual recording
        isManualRecording = true;
        tapSpeakBtn.classList.add('recording');
        tapSpeakText.textContent = 'Speaking... Tap When Done';
        micRecorder.start();
        micMeterLabel.textContent = 'Recording Voice...';
      } else {
        // Stop and send audio
        isManualRecording = false;
        tapSpeakBtn.classList.remove('recording');
        tapSpeakText.textContent = 'Tap to Speak';
        micMeterLabel.textContent = 'Sending to STT...';
        const wavBlob = micRecorder.stop();
        if (wavBlob && wavBlob.size > 2000) {
          processRecordedAudio(wavBlob);
        }
      }
    });
  }

  if (callTypeToggleBtn) {
    callTypeToggleBtn.addEventListener('click', () => {
      const isHidden = inCallInputBox.style.display === 'none';
      inCallInputBox.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) inCallTextInput.focus();
    });
  }

  const sendInCallText = () => {
    const text = inCallTextInput.value.trim();
    if (!text || !isCallActive) return;
    inCallTextInput.value = '';
    captionLabel.textContent = currentProfile.user_name || 'You';
    captionText.textContent = `"${text}"`;
    handleUserSpokenMessage(text);
  };

  if (inCallSendBtn) inCallSendBtn.addEventListener('click', sendInCallText);
  if (inCallTextInput) {
    inCallTextInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendInCallText();
    });
  }

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
      stopListeningCycle();
      document.getElementById('micOnIcon').style.display = 'none';
      document.getElementById('micOffIcon').style.display = 'block';
      callStatusText.textContent = 'Microphone Muted';
    } else {
      document.getElementById('micOnIcon').style.display = 'block';
      document.getElementById('micOffIcon').style.display = 'none';
      callStatusText.textContent = 'Connected (In Call)';
      if (handsFreeToggle.checked) startListeningCycle();
    }
  });

  closeModalBtn.addEventListener('click', () => {
    postCallModal.classList.remove('active');
  });

  // Chat message send
  chatSendBtn.addEventListener('click', sendChatMessage);
  chatTextInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // Clear chat
  clearChatBtn.addEventListener('click', async () => {
    if (confirm('Clear conversation history?')) {
      await fetch('/api/reset', { method: 'POST' });
      messagesContainer.innerHTML = '';
      loadHistory();
      loadMemories();
    }
  });

  // Add Memory
  addMemoryBtn.addEventListener('click', async () => {
    const text = newMemoryInput.value.trim();
    if (!text) return;
    await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact: text })
    });
    newMemoryInput.value = '';
    loadMemories();
  });

  // Persona Selection Cards
  personaCards.forEach(card => {
    card.addEventListener('click', async () => {
      personaCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      const friendName = card.dataset.name;
      const voice = card.dataset.voice;

      const payload = {
        user_name: userNameInput.value.trim() || 'Friend',
        preferred_language: languageSelect.value,
        ai_friend_name: friendName,
        ai_voice: voice
      };

      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      await loadProfile();
    });
  });

  // Save Persona Settings
  saveProfileBtn.addEventListener('click', async () => {
    const activeCard = document.querySelector('.persona-card.active');
    const friendName = activeCard ? activeCard.dataset.name : 'Shanthi';
    const voice = activeCard ? activeCard.dataset.voice : 'roopa';

    const payload = {
      user_name: userNameInput.value.trim() || 'Friend',
      preferred_language: languageSelect.value,
      ai_friend_name: friendName,
      ai_voice: voice
    };

    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    alert('Profile & Persona updated successfully!');
    await loadProfile();
  });
}

// Chat Flow
async function sendChatMessage() {
  const text = chatTextInput.value.trim();
  if (!text) return;

  chatTextInput.value = '';
  appendMessage('user', text);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        call_id: null,
        audio_mode: true
      })
    });
    const data = await res.json();
    appendMessage('ai', data.reply, data.audio_base64);
  } catch (err) {
    console.error('Send error:', err);
  }
}

function appendMessage(sender, text, audioBase64 = null) {
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${sender}`;
  bubble.innerHTML = `<p>${text}</p>`;

  if (sender === 'ai' && audioBase64) {
    const playBtn = document.createElement('button');
    playBtn.className = 'voice-play-btn';
    playBtn.innerHTML = `▶ Listen`;
    playBtn.onclick = () => {
      const a = new Audio(`data:audio/wav;base64,${audioBase64}`);
      a.play();
    };
    bubble.appendChild(playBtn);
  }

  messagesContainer.appendChild(bubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Load Memories & History Data
async function loadMemories() {
  try {
    const res = await fetch('/api/memories');
    const memories = await res.json();

    memoriesList.innerHTML = '';
    if (memories.length === 0) {
      memoriesList.innerHTML = '<p class="subtitle" style="padding:10px 0;">No memories stored yet. Call or chat to create some!</p>';
      return;
    }

    memories.forEach(m => {
      const div = document.createElement('div');
      div.className = 'memory-item';
      div.innerHTML = `
        <span>📌 ${m.fact}</span>
        <button class="delete-mem-btn" data-id="${m.id}">&times;</button>
      `;
      div.querySelector('.delete-mem-btn').addEventListener('click', async () => {
        await fetch(`/api/memories/${m.id}`, { method: 'DELETE' });
        loadMemories();
      });
      memoriesList.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load memories:', err);
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();

    messagesContainer.innerHTML = '';
    data.messages.forEach(m => {
      appendMessage(m.sender, m.text, m.audio_base64);
    });

    callsList.innerHTML = '';
    if (data.calls.length === 0) {
      callsList.innerHTML = '<p class="subtitle">No previous calls logged yet.</p>';
      return;
    }

    data.calls.forEach(c => {
      const div = document.createElement('div');
      div.className = 'call-history-item';
      const dateStr = new Date(c.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `
        <div class="call-meta">
          <span>${dateStr} (${c.duration_sec || 0}s)</span>
          <span>Mood: ${c.mood || 'good'}</span>
        </div>
        <div class="call-summary-txt">"${c.summary || 'Short friendly call'}"</div>
      `;
      callsList.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}
