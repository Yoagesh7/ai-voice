import os
import base64
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    get_profile, update_profile,
    get_all_memories, add_memory, delete_memory,
    save_message, get_recent_messages,
    start_call, end_call, get_call_history, clear_all_data
)
from ai_services import generate_friend_response, text_to_speech, speech_to_text
from memory_engine import extract_memories_and_summary

app = FastAPI(title="AI Friend Voice Calling Platform")

# Enable CORS for local dev / mobile / browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class ChatRequest(BaseModel):
    text: str
    call_id: Optional[int] = None
    audio_mode: bool = True

class EndCallRequest(BaseModel):
    call_id: int
    duration_sec: int
    transcript: List[dict]

class ProfileUpdateRequest(BaseModel):
    user_name: str
    preferred_language: str
    ai_friend_name: str
    ai_voice: str
    user_bio: Optional[str] = None

class MemoryAddRequest(BaseModel):
    fact: str
    category: Optional[str] = "general"

# ---------------- API Endpoints ----------------

@app.get("/api/profile")
async def api_get_profile():
    return get_profile()

@app.put("/api/profile")
async def api_update_profile(req: ProfileUpdateRequest):
    return update_profile(
        user_name=req.user_name,
        preferred_language=req.preferred_language,
        ai_friend_name=req.ai_friend_name,
        ai_voice=req.ai_voice,
        user_bio=req.user_bio
    )

@app.get("/api/memories")
async def api_get_memories():
    return get_all_memories()

@app.post("/api/memories")
async def api_add_memory(req: MemoryAddRequest):
    add_memory(req.fact, req.category)
    return {"status": "ok", "memories": get_all_memories()}

@app.delete("/api/memories/{memory_id}")
async def api_delete_memory(memory_id: int):
    delete_memory(memory_id)
    return {"status": "deleted"}

@app.get("/api/history")
async def api_get_history():
    return {
        "calls": get_call_history(15),
        "messages": get_recent_messages(30)
    }

@app.post("/api/call/start")
async def api_start_call():
    call_id = start_call()
    profile = get_profile()
    friend_name = profile.get("ai_friend_name", "Shanthi")
    voice = profile.get("ai_voice", "shruti")
    if friend_name.lower() in ["shanthi"] and voice in ["roopa", "kavitha"]:
        voice = "shruti"
    lang = profile.get("preferred_language", "tanglish")

    # Generate persona-appropriate warm initial greeting audio
    if friend_name.lower() in ["shanthi", "roopa"]:
        if lang == "tamil":
            greeting = f"வணக்கம் பா, சாந்தி பேசுறேன். நல்லா ஓய்வா உட்காருங்க... சொல்லுங்க, எப்படி இருக்கீங்க?"
        elif lang == "english":
            greeting = f"Hello dear, Shanthi here. Take a gentle breath, relax... how was your day?"
        else: # Tanglish
            greeting = f"Vanakkam pa, Shanthi pesuren. Nalla relax ah ukkanthu sollu... how was your day?"
    elif friend_name.lower() in ["anand", "ratan"]:
        greeting = f"Vanakkam pa, Anand pesuren. Relax panniko, sollu enna vishayam?"
    else:
        if lang == "tamil":
            greeting = f"ஹலோ! சொல்லுங்க, எப்படி இருக்கீங்க? நான் {friend_name}."
        elif lang == "english":
            greeting = f"Hey! So good to hear from you. How was your day?"
        else: # Tanglish
            greeting = f"Hey da! {friend_name} here. Solra, how was your day today?"

    audio_b64 = await text_to_speech(greeting, speaker=voice, language_code="ta-IN")
    save_message("ai", greeting, audio_base64=audio_b64, call_id=call_id)

    return {
        "call_id": call_id,
        "friend_name": friend_name,
        "voice": voice,
        "greeting_text": greeting,
        "greeting_audio": audio_b64
    }

@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    profile = get_profile()
    memories = get_all_memories()
    history = get_recent_messages(10)

    # Save user message
    save_message("user", req.text, call_id=req.call_id)

    # Generate response
    reply_text = await generate_friend_response(
        user_message=req.text,
        chat_history=history,
        memories=memories,
        profile=profile
    )

    audio_b64 = None
    if req.audio_mode:
        friend_name = profile.get("ai_friend_name", "Shanthi")
        speaker = profile.get("ai_voice", "shruti")
        if friend_name.lower() in ["shanthi"] and speaker in ["roopa"]:
            speaker = "shruti"
        audio_b64 = await text_to_speech(reply_text, speaker=speaker, language_code="ta-IN")

    # Save AI message
    save_message("ai", reply_text, audio_base64=audio_b64, call_id=req.call_id)

    return {
        "reply": reply_text,
        "audio_base64": audio_b64,
        "friend_name": profile.get("ai_friend_name", "Nila")
    }

@app.post("/api/stt")
async def api_stt(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    transcript = await speech_to_text(audio_bytes, filename=file.filename or "recording.wav")
    return {"transcript": transcript}

@app.post("/api/call/end")
async def api_end_call(req: EndCallRequest):
    profile = get_profile()
    user_name = profile.get("user_name", "Friend")

    # Extract memory facts and cute summary
    analysis = await extract_memories_and_summary(req.transcript, user_name)

    end_call(
        call_id=req.call_id,
        duration_sec=req.duration_sec,
        summary=analysis.get("summary", "Finished call with friend."),
        mood=analysis.get("mood", "good"),
        transcript=req.transcript
    )

    return {
        "status": "call_ended",
        "analysis": analysis,
        "memories": get_all_memories()
    }

@app.post("/api/reset")
async def api_reset():
    clear_all_data()
    return {"status": "cleared"}

# Serve Frontend static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
