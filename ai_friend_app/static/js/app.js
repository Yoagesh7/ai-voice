// State Management
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
let animationFrameId = null;

// DOM Elements
const stageContainer = document.querySelector('.stage-container');
const startCallBtn = document.getElementById('startCallBtn');
const startCallBtnLabel = document.getElementById('startCallBtnLabel');
const activeCallControls = document.getElementById('activeCallControls');
const standbyControls = document.getElementById('standbyControls');
const muteBtn = document.getElementById('muteBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatusText = document.getElementById('callStatusText');
const activeDot = document.getElementById('activeDot');
const callTimer = document.getElementById('callTimer');
const captionLabel = document.getElementById('captionLabel');
const captionText = document.getElementById('captionText');
const handsFreeToggle = document.getElementById('handsFreeToggle');
const callSubOptions = document.getElementById('callSubOptions');
const callTypeToggleBtn = document.getElementById('callTypeToggleBtn');
const inCallInputBox = document.getElementById('inCallInputBox');
const inCallTextInput = document.getElementById('inCallTextInput');
const inCallSendBtn = document.getElementById('inCallSendBtn');

// Caller Card
const callerName = document.getElementById('callFriendName');
const callerDesc = document.getElementById('callerDesc');
const callerInitial = document.getElementById('callerInitial');

// Mic Level & Canvas
const micMeterFill = document.getElementById('micMeterFill');
const micMeterLabel = document.getElementById('micMeterLabel');
const tapSpeakBtn = document.getElementById('tapSpeakBtn');
const tapSpeakText = document.getElementById('tapSpeakText');
const canvas = document.getElementById('waveformCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

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
const personaOptions = document.querySelectorAll('.persona-option');
const currentLangBadge = document.getElementById('currentLangBadge');

// =================== Native 16kHz PCM WAV Recorder ===================
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

    // Audio Peak Normalization for mobile mic clarity
    let maxPeak = 0;
    for (let i = 0; i < merged.length; i++) {
      const abs = Math.abs(merged[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
    if (maxPeak > 0.03 && maxPeak < 0.85) {
      const gain = Math.min(3.5, 0.88 / maxPeak);
      for (let i = 0; i < merged.length; i++) {
        merged[i] = Math.max(-1, Math.min(1, merged[i] * gain));
      }
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
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return view;
  }
}

// =================== Acoustic Waveform Canvas ===================
let wavePhase = 0;
function drawWaveform() {
  if (!ctx || !canvas) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  let amplitude = 4;
  let frequency = 0.02;

  if (isCallActive) {
    if (!audioPlayer.paused) {
      // AI speaking: energetic rhythmic wave
      amplitude = 22;
      frequency = 0.035;
      wavePhase += 0.12;
    } else if (micRecorder && micRecorder.getVolume() > 10) {
      // User speaking
      const vol = micRecorder.getVolume();
      amplitude = Math.min(28, 6 + vol * 0.7);
      frequency = 0.04;
      wavePhase += 0.09;
    } else {
      // Idle in call
      amplitude = 6;
      wavePhase += 0.03;
    }
  } else {
    // Standby
    amplitude = 3;
    wavePhase += 0.015;
  }

  // Draw 2 overlay sine curves for clean acoustic depth
  ctx.beginPath();
  ctx.strokeStyle = isCallActive ? 'rgba(16, 185, 129, 0.7)' : 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 2;

  for (let x = 0; x < width; x++) {
    const y = height / 2 + Math.sin(x * frequency + wavePhase) * amplitude;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Second quieter harmonic
  ctx.beginPath();
  ctx.strokeStyle = isCallActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(148, 163, 184, 0.15)';
  ctx.lineWidth = 1.5;

  for (let x = 0; x < width; x++) {
    const y = height / 2 + Math.cos(x * (frequency * 0.8) - wavePhase) * (amplitude * 0.65);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  animationFrameId = requestAnimationFrame(drawWaveform);
}

// =================== Initialization ===================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadProfile();
  await loadMemories();
  await loadHistory();
  setupSpeechRecognition();
  setupEventListeners();
  drawWaveform();
});

// Navigation Handling
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.panel-section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.getAttribute('data-tab');

      // For desktop sidebar panels
      panels.forEach(p => {
        if (p.id === targetId) {
          p.style.display = 'flex';
        } else if (targetId !== 'call-panel') {
          p.style.display = 'none';
        }
      });

      // Mobile responsive toggle
      if (window.innerWidth <= 860) {
        const sidebar = document.querySelector('.sidebar-container');
        const stage = document.querySelector('.stage-container');
        if (targetId === 'call-panel') {
          stage.style.display = 'flex';
          sidebar.style.display = 'none';
        } else {
          stage.style.display = 'none';
          sidebar.style.display = 'flex';
        }
      }
    });
  });
}

// Load Profile
async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    currentProfile = await res.json();

    const name = currentProfile.ai_friend_name || 'Shanthi';
    callerName.textContent = name;
    callerInitial.textContent = name.charAt(0);
    captionLabel.textContent = name;
    startCallBtnLabel.textContent = `Call ${name}`;
    currentLangBadge.textContent = (currentProfile.preferred_language || 'Tanglish').toUpperCase();

    // Descriptions
    const descriptions = {
      'shanthi': "Calm, mature woman's voice · Speaks Tanglish & Tamil",
      'nila': "Warm, affectionate bestie · Speaks modern Tanglish",
      'priya': "Soft, gentle confidante · Speaks peaceful Tamil",
      'karthik': "Casual, supportive brother · Everyday casual chat"
    };
    callerDesc.textContent = descriptions[name.toLowerCase()] || "Conversational voice companion";

    userNameInput.value = currentProfile.user_name || 'Friend';
    languageSelect.value = currentProfile.preferred_language || 'tanglish';

    personaOptions.forEach(opt => {
      if (opt.dataset.name.toLowerCase() === name.toLowerCase()) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// Setup Speech Recognition
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

// =================== Call Lifecycle ===================
async function startCall() {
  try {
    const layout = document.querySelector('.app-layout');
    if (layout) layout.classList.add('in-call-fullscreen');

    callStatusText.textContent = 'Connecting...';
    activeDot.classList.add('live');
    stageContainer.classList.add('in-call');
    standbyControls.style.display = 'none';
    activeCallControls.style.display = 'flex';
    callSubOptions.style.display = 'flex';

    // Unlock audio context
    try {
      audioPlayer.play().then(() => audioPlayer.pause()).catch(() => {});
    } catch(e) {}

    // Init native mic recorder
    if (!micRecorder) {
      micRecorder = new NativeWavRecorder();
    }
    await micRecorder.init();

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
      callStatusText.textContent = 'Connected';
      startListeningCycle();
    }
  } catch (err) {
    console.error('Call failed:', err);
    callStatusText.textContent = 'Connection failed';
    alert('Could not start call. Please check microphone permissions.');
    resetCallUI();
  }
}

function startVolumeMonitor() {
  clearInterval(volumeCheckInterval);
  volumeCheckInterval = setInterval(() => {
    if (!micRecorder || !isCallActive || isMuted) {
      if (micMeterFill) micMeterFill.style.width = '0%';
      return;
    }

    const vol = micRecorder.getVolume();
    micMeterFill.style.width = `${Math.min(100, vol * 2.5)}%`;

    if (handsFreeToggle.checked && !isManualRecording && audioPlayer.paused) {
      const speechThreshold = 14;

      if (vol > speechThreshold) {
        if (!isUserSpeaking) {
          isUserSpeaking = true;
          silenceStart = null;
          micRecorder.start();
          micMeterLabel.textContent = 'Voice detected';
          callStatusText.textContent = 'Listening to you...';
        }
        silenceStart = null;
      } else if (isUserSpeaking) {
        if (!silenceStart) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > 1200) {
          isUserSpeaking = false;
          silenceStart = null;
          micMeterLabel.textContent = 'Processing speech...';
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
  callStatusText.textContent = 'Connected (Listening)';

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

// Process user audio via Sarvam saaras:v3 STT
async function processRecordedAudio(wavBlob) {
  stopListeningCycle();
  callStatusText.textContent = `${currentProfile.ai_friend_name || 'Shanthi'} is listening...`;
  captionLabel.textContent = currentProfile.user_name || 'You';
  captionText.textContent = '"Listening..."';

  try {
    const formData = new FormData();
    formData.append('file', wavBlob, 'user_speech.wav');
    formData.append('language_code', currentProfile.preferred_language === 'english' ? 'en-IN' : 'ta-IN');

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
      captionText.textContent = '"(Could not hear clearly, could you say that again?)"';
      callStatusText.textContent = 'Connected';
      if (isCallActive && handsFreeToggle.checked) startListeningCycle();
    }
  } catch (err) {
    console.error('STT upload error:', err);
    callStatusText.textContent = 'Connected';
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
      callStatusText.textContent = 'Connected';
      if (isCallActive && handsFreeToggle.checked && !isMuted) startListeningCycle();
    }
  } catch (err) {
    console.error('Chat error:', err);
    callStatusText.textContent = 'Connected';
    if (isCallActive && handsFreeToggle.checked && !isMuted) startListeningCycle();
  }
}

function playAiVoice(base64Audio) {
  stopListeningCycle();
  stageContainer.classList.add('speaking');
  callStatusText.textContent = `${currentProfile.ai_friend_name || 'Shanthi'} is speaking...`;
  if (micMeterLabel) micMeterLabel.textContent = 'Voice active';

  audioPlayer.src = `data:audio/wav;base64,${base64Audio}`;
  audioPlayer.play().catch(e => console.log('Autoplay audio blocked:', e));

  audioPlayer.onended = () => {
    stageContainer.classList.remove('speaking');
    callStatusText.textContent = 'Connected';
    if (micMeterLabel) micMeterLabel.textContent = 'Microphone standby';
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

  stageContainer.classList.remove('in-call', 'speaking');
  activeDot.classList.remove('live');
  callStatusText.textContent = 'Saving conversation...';

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
  const layout = document.querySelector('.app-layout');
  if (layout) layout.classList.remove('in-call-fullscreen');

  isCallActive = false;
  currentCallId = null;
  standbyControls.style.display = 'flex';
  activeCallControls.style.display = 'none';
  callSubOptions.style.display = 'none';
  if (inCallInputBox) inCallInputBox.style.display = 'none';
  callStatusText.textContent = 'Ready to connect';
  callTimer.textContent = '00:00';
  activeDot.classList.remove('live');
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

function showPostCallModal(analysis) {
  modalTitle.textContent = `Call with ${currentProfile.ai_friend_name || 'Shanthi'}`;
  modalSummary.textContent = `"${analysis.summary}"`;
  modalMoodEmoji.textContent = (analysis.mood || 'Reflective').toUpperCase();

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

// =================== Event Listeners ===================
function setupEventListeners() {
  if (startCallBtn) startCallBtn.addEventListener('click', startCall);
  if (endCallBtn) endCallBtn.addEventListener('click', endCall);

  // Tap-to-Speak button
  if (tapSpeakBtn) {
    tapSpeakBtn.addEventListener('click', async () => {
      if (!isCallActive || !micRecorder) return;

      if (!isManualRecording) {
        isManualRecording = true;
        tapSpeakBtn.classList.add('recording');
        tapSpeakText.textContent = 'Speaking... Tap to finish';
        micRecorder.start();
        micMeterLabel.textContent = 'Recording speech';
      } else {
        isManualRecording = false;
        tapSpeakBtn.classList.remove('recording');
        tapSpeakText.textContent = 'Tap to speak';
        micMeterLabel.textContent = 'Transcribing...';
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
      callStatusText.textContent = 'Microphone muted';
      micMeterLabel.textContent = 'Muted';
    } else {
      document.getElementById('micOnIcon').style.display = 'block';
      document.getElementById('micOffIcon').style.display = 'none';
      callStatusText.textContent = 'Connected';
      micMeterLabel.textContent = 'Microphone active';
      if (handsFreeToggle.checked) startListeningCycle();
    }
  });

  closeModalBtn.addEventListener('click', () => {
    postCallModal.classList.remove('active');
  });

  // Chat tab send
  chatSendBtn.addEventListener('click', sendChatMessage);
  chatTextInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  clearChatBtn.addEventListener('click', async () => {
    if (confirm('Clear message history?')) {
      await fetch('/api/reset', { method: 'POST' });
      messagesContainer.innerHTML = '';
      loadHistory();
      loadMemories();
    }
  });

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

  personaOptions.forEach(opt => {
    opt.addEventListener('click', async () => {
      personaOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');

      const friendName = opt.dataset.name;
      const voice = opt.dataset.voice;

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

  saveProfileBtn.addEventListener('click', async () => {
    const activeOpt = document.querySelector('.persona-option.active');
    const friendName = activeOpt ? activeOpt.dataset.name : 'Shanthi';
    const voice = activeOpt ? activeOpt.dataset.voice : 'shruti';

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

    alert('Preferences saved');
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
  bubble.className = `bubble ${sender}`;
  bubble.innerHTML = `<p>${text}</p>`;

  if (sender === 'ai' && audioBase64) {
    const playBtn = document.createElement('button');
    playBtn.className = 'voice-replay-tag';
    playBtn.innerHTML = `Play voice`;
    playBtn.onclick = () => {
      const a = new Audio(`data:audio/wav;base64,${audioBase64}`);
      a.play();
    };
    bubble.appendChild(playBtn);
  }

  messagesContainer.appendChild(bubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Data loaders
async function loadMemories() {
  try {
    const res = await fetch('/api/memories');
    const memories = await res.json();

    memoriesList.innerHTML = '';
    if (memories.length === 0) {
      memoriesList.innerHTML = '<p class="section-desc" style="padding: 8px 0;">No memories recorded yet.</p>';
      return;
    }

    memories.forEach(m => {
      const div = document.createElement('div');
      div.className = 'memory-row';
      div.innerHTML = `
        <span>${m.fact}</span>
        <button class="del-btn" data-id="${m.id}">&times;</button>
      `;
      div.querySelector('.del-btn').addEventListener('click', async () => {
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
      callsList.innerHTML = '<p class="section-desc">No previous call logs recorded.</p>';
      return;
    }

    data.calls.forEach(c => {
      const div = document.createElement('div');
      div.className = 'call-log-row';
      const dateStr = new Date(c.start_time).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      div.innerHTML = `
        <div class="call-log-meta">
          <span>${dateStr}</span>
          <span>${c.duration_sec || 0}s · ${c.mood || 'good'}</span>
        </div>
        <p class="call-log-summary">"${c.summary || 'Heart-to-heart voice call'}"</p>
      `;
      callsList.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}
