# 🌸 AI Friend Voice Calling App (Nila)

An empathetic AI best-friend voice calling web application that speaks natural **Tanglish (Tamil + English)**, **Pure Tamil**, and **English**. It features a realistic phone-call experience, real-time voice streaming with speech visualizers, long-term memory extraction, and chat history.

---

## ⚡ Tech Stack & Architecture

- **Voice & Speech Synthesis (TTS):** [Sarvam AI](https://www.sarvam.ai/) `bulbul:v3` (Speakers: `kavitha`, `gokul`, `priya`, `vijay`, `roopa`, `shruti`).
- **Conversational Brain (LLM):** [NVIDIA NIM](https://build.nvidia.com/) `google/gemma-4-31b-it` tuned with an empathetic, culturally authentic Tanglish buddy persona.
- **Speech-to-Text (STT):** Browser Web Speech Recognition API with seamless hands-free detection + Sarvam `saaras:v3`.
- **Memory & Storage Engine:** SQLite persistent database (`friend_memory.db`) storing:
  - Personal facts & memories automatically extracted after every call.
  - Call logs with mood analysis and summary.
  - Chat history and voice notes.
- **Frontend:** Glassmorphism Dark UI with audio pulse rings, live subtitle captions, in-call typing, and WhatsApp-style messenger.

---

## 🚀 How to Run

### Method 1: Double-click Launcher
Simply double-click `run.bat` in the root or in `ai_friend_app/`.

### Method 2: Command Line
```powershell
cd "e:\projact\mg 2\ai_friend_app"
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Open your browser at:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🌟 Key Features

1. **Realistic Phone Call UI:**
   - Ringing & connected state with active call timer (`01:23`).
   - Glowing soundwave orb that pulses when your AI friend is speaking.
   - Continuous Hands-Free mode (talk naturally without pressing buttons) or Push-To-Talk.
   - In-call live subtitle captions showing what you and the AI are saying.
   - Mute microphone, speaker toggle, and in-call text typing.

2. **Authentic Tanglish / Tamil / English:**
   - Speaks like a real Chennai/Tamil friend using natural words (*"Ayo, enna aachu da? Relax pannu, first oru tea kudi..."*).
   - Validates emotions (sad, stressed, happy) before giving advice.

3. **Long-Term Memory Brain:**
   - When a call ends, the Memory Engine automatically extracts personal facts (e.g. *"Works at an office"*, *"Felt stressed about exams"*, *"Likes biryani"*).
   - Next time you call, your friend remembers and naturally follows up!
   - You can view, add, or delete memories anytime in the **Memory** tab.

4. **Multi-Friend Persona Switcher:**
   - **Nila:** Warm, caring girl bestie (Voice: Kavitha).
   - **Karthik:** Chill, supportive bro (Voice: Gokul).
   - **Meera:** Calm, gentle confidante (Voice: Priya).
   - **Vijay:** Energetic buddy (Voice: Vijay).

5. **Chat & Voice Notes Tab:**
   - WhatsApp-style chat interface where you can read and re-listen to voice notes anytime.
