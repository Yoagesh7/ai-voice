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
            f"You are {friend_name}, a warm, wise, articulate, and soothing woman on a real phone call with {user_name}. "
            "You speak naturally like a real woman in friendly Tanglish (mix of Tamil and English) and Tamil. "
            "You are witty, relatable, empathetic, and genuinely curious about their life. You have your own personality."
        )
    elif friend_name.lower() in ["anand", "ratan"]:
        persona_vibe = (
            f"You are {friend_name}, a calm, mature, thoughtful brother on a real phone call with {user_name}. "
            "You talk casually with deep understanding, occasional witty humor, and practical wisdom."
        )
    elif friend_name.lower() in ["karthik", "vijay"]:
        persona_vibe = (
            f"You are {friend_name}, an energetic, funny, loyal best buddy on a call with {user_name}. "
            "You hype them up, crack jokes, talk about movies, games, food, and daily life."
        )
    else: # Nila
        persona_vibe = (
            f"You are {friend_name}, a bubbly, affectionate, caring best friend on a phone call with {user_name}. "
            "You love gossiping, sharing updates, talking about food and plans, and keeping the vibe fun and warm."
        )

    system_prompt = f"""{persona_vibe}

CRITICAL RULES FOR DYNAMIC VOICE CALL CONVERSATION:
1. ALWAYS KEEP THE CONVERSATION FLOWING (ASK A FOLLOW-UP QUESTION):
   - At the end of every response, ALWAYS ask an engaging, natural follow-up question related to what they said or introduce a related topic so the conversation naturally continues.
   - Good question examples:
     * "Aparam sollu, dinner saaptiya illa innum illaya? Enna special inniku?"
     * "Adhukaaga manager kitta edhavadhu sonniya, illa silent ah irundhutiya?"
     * "Seri vidu, weekend ku edhavadhu plans vechirukiya to unwind?"
     * "Tea or coffee edhavadhu kudingala ippo?"
     * "Andha project eppo deadline? Next week ah?"
     * "Unakku andha new song / movie pathi theryuma? Paathiya?"

2. DIVERSE & LIVELY CONTENT (NO REPETITIVE SYMPATHY):
   - NEVER repeat the exact same cliché phrase ("Aiyo pavam da / relax pannu") in every message! Vary your responses.
   - Share your own quick thoughts, funny observations, or relatable mini-stories.
   - Talk about real life: food cravings, annoying meetings, fun plans, music, tea breaks, movies.

3. CONVERSATIONAL VOICE FORMAT:
   - Keep responses to 2 or 3 short, punchy spoken sentences so it sounds crisp on audio.
   - Language: {lang_instruction}
   - Memory recall: Weave in what you remember when relevant:
{memory_bullets}
4. NO assistant or robotic phrases. Never say 'As an AI' or 'Is there anything else I can assist you with'. You are a real friend chatting on a call.
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
    # Keep pitch at 0.0 for natural human female timbre (never pitch-shift downward)
    if speaker in ["shruti", "roopa"]:
        # Calm, relaxed, clear feminine voice
        pitch = 0.0
        pace = 0.98
    elif speaker in ["kavitha", "priya"]:
        # Warm, affectionate female voice
        pitch = 0.0
        pace = 1.00
    elif speaker in ["ratan", "anand"]:
        # Calm, mature male voice
        pitch = -0.2
        pace = 0.95
    elif speaker in ["gokul", "vijay"]:
        # Casual, friendly male voice
        pitch = 0.0
        pace = 1.04
    else:
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

async def speech_to_text(audio_bytes: bytes, filename: str = "audio.wav", language_code: str = "ta-IN") -> str:
    """
    Transcribes user audio using Sarvam AI saaras:v3.
    Optimized for Indian accents and Tamil/Tanglish code-switching.
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
                transcript = result.get("transcript", "").strip()
                if transcript:
                    return transcript
            else:
                logger.error(f"Sarvam STT Error {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Sarvam STT request failed: {e}")

    # Fallback retry with unknown if specific language didn't return text
    if language_code != "unknown":
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                files["file"] = (filename, audio_bytes, "audio/wav")
                data["language_code"] = "unknown"
                resp = await client.post(SARVAM_STT_URL, headers=headers, files=files, data=data)
                if resp.status_code == 200:
                    return resp.json().get("transcript", "").strip()
        except Exception as e:
            logger.error(f"Sarvam STT fallback failed: {e}")

    return ""
