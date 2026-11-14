import httpx
import json
import logging
from config import (
    NVIDIA_API_KEY, NVIDIA_CHAT_MODEL, NVIDIA_BASE_URL,
    SARVAM_API_KEY, SARVAM_TTS_MODEL, SARVAM_TTS_URL,
    SARVAM_STT_MODEL, SARVAM_STT_URL
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_services")

async def generate_friend_response(user_message: str, chat_history: list, memories: list, profile: dict) -> str:
    """
    Generates a natural, emotional best-friend response in Tanglish/Tamil/English
    using the NVIDIA chat model.
    """
    friend_name = profile.get("ai_friend_name", "Nila")
    user_name = profile.get("user_name", "Friend")
    language_pref = profile.get("preferred_language", "tanglish").lower()
    voice = profile.get("ai_voice", "kavitha")

    # Format memories into prompt context
    memory_bullets = "\n".join([f"- {m['fact']}" for m in memories[:12]]) if memories else "None yet."

    # Language instruction
    if language_pref == "tamil":
        lang_instruction = "Speak in warm, conversational spoken Tamil (தமிழ்). Keep it very natural, like talking to an affectionate close friend on a call."
    elif language_pref == "english":
        lang_instruction = "Speak in natural Indian English with warm emotional intimacy, occasional cute words, like a best friend on a phone call."
    else: # Tanglish
        lang_instruction = (
            "Speak in authentic modern conversational TANGLISH (Tamil written in English script mixed with English words). "
            "Use natural Tamil colloquial words like 'da', 'pa', 'aiyo', 'enna aachu', 'sollu', 'romba', 'apdiya', 'relax pannu', 'don't worry'. "
            "Match the user's emotional vibe. Be caring, humorous, and empathetic."
        )

    # Persona Tone Tuning
    if friend_name.lower() in ["shanthi", "roopa"]:
        persona_vibe = (
            f"You are {friend_name}, a deeply calm, mature, peaceful, and grounding confidante/elder sister on a phone call with {user_name}. "
            "Your voice is gentle, unhurried, reassuring, and mature. You help {user_name} feel peaceful, safe, and heard. "
            "Use soothing, caring Tamil/Tanglish phrases like 'Pathukalam da', 'Relax panniko, take a deep breath', 'Mella sollu, na kettu irukken'."
        )
    elif friend_name.lower() in ["anand", "ratan"]:
        persona_vibe = (
            f"You are {friend_name}, a calm, mature, wise, and grounded brother/mentor on a phone call with {user_name}. "
            "You speak with quiet confidence, understanding, and warmth. Never rush."
        )
    elif friend_name.lower() in ["karthik", "vijay"]:
        persona_vibe = (
            f"You are {friend_name}, an energetic, chill, loyal best buddy on a phone call with {user_name}. "
            "You motivate them, laugh with them, and keep spirits high."
        )
    else: # Nila
        persona_vibe = (
            f"You are {friend_name}, an intimate, emotionally supportive, loving best friend on a real phone call with {user_name}. "
            "You care deeply, celebrate their wins, and comfort them when down."
        )

    system_prompt = f"""{persona_vibe}

CRITICAL BEHAVIOR FOR VOICE CALL:
1. Short & Conversational: Keep responses to 1-3 short sentences. This is a real phone call, not an essay.
2. Emotional Attunement: If {user_name} is sad, stressed, or angry, validate their feelings first before offering comfort or advice. If happy, celebrate excitedly!
3. Language: {lang_instruction}
4. Memory Recall: Naturally mention what you know about them when relevant:
{memory_bullets}
5. No robotic or assistant phrases. Never say 'As an AI' or 'How can I assist you'. You are a real friend chatting on a call.
6. Avoid special characters or symbols that sound weird when read aloud by TTS.
"""

    messages = [{"role": "system", "content": system_prompt}]

    # Add past few turns
    for turn in chat_history[-6:]:
        role = "user" if turn.get("sender") == "user" else "assistant"
        content = turn.get("text", "")
        if content:
            messages.append({"role": role, "content": content})

    # Current user message
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": NVIDIA_CHAT_MODEL,
        "messages": messages,
        "temperature": 0.75,
        "max_tokens": 160,
        "top_p": 0.95
    }

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=25.0) as client:
        try:
            resp = await client.post(NVIDIA_BASE_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                reply = data["choices"][0]["message"]["content"].strip()
                return reply
            else:
                logger.error(f"NVIDIA API Error {resp.status_code}: {resp.text}")
                return "Ayo, call konjam glitch aaguthu da. Can you say that again?"
        except Exception as e:
            logger.error(f"NVIDIA request failed: {e}")
            return "Kekala da, connection konjam weak ah irukku. One second sollu?"

async def text_to_speech(text: str, speaker: str = "kavitha", language_code: str = "ta-IN") -> str:
    """
    Synthesizes speech using Sarvam AI Bulbul:v3.
    Returns base64 encoded audio string.
    """
    # Clean up text for TTS (remove emojis or markdown)
    clean_text = text.replace("*", "").replace("#", "").strip()

    # Determine pitch and pace based on persona
    if speaker in ["roopa", "suhani"]:
        # Calm, relaxed, mature feminine voice
        pitch = -0.5
        pace = 0.90
    elif speaker in ["ratan", "anand"]:
        # Calm, mature, grounded masculine voice
        pitch = -0.6
        pace = 0.92
    elif speaker in ["gokul", "vijay"]:
        # Casual, upbeat
        pitch = 0.0
        pace = 1.05
    else: # kavitha, priya
        # Natural warm bestie
        pitch = 0.0
        pace = 1.00

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json"
    }

    payload = {
        "inputs": [clean_text],
        "target_language_code": language_code,
        "speaker": speaker,
        "pitch": pitch,
        "pace": pace,
        "loudness": 1.0,
        "speech_sample_rate": 22050,
        "enable_preprocessing": True,
        "model": SARVAM_TTS_MODEL
    }

    async with httpx.AsyncClient(timeout=25.0) as client:
        try:
            resp = await client.post(SARVAM_TTS_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                audios = data.get("audios", [])
                if audios:
                    return audios[0]
            else:
                logger.error(f"Sarvam TTS Error {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Sarvam TTS request failed: {e}")
    return None

async def speech_to_text(audio_bytes: bytes, filename: str = "audio.wav", language_code: str = "unknown") -> str:
    """
    Transcribes user audio using Sarvam AI saaras:v3.
    """
    headers = {
        "api-subscription-key": SARVAM_API_KEY
    }

    files = {
        "file": (filename, audio_bytes, "audio/wav")
    }
    data = {
        "model": SARVAM_STT_MODEL,
        "language_code": language_code
    }

    async with httpx.AsyncClient(timeout=25.0) as client:
        try:
            resp = await client.post(SARVAM_STT_URL, headers=headers, files=files, data=data)
            if resp.status_code == 200:
                result = resp.json()
                return result.get("transcript", "").strip()
            else:
                logger.error(f"Sarvam STT Error {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Sarvam STT request failed: {e}")
    return ""
