import httpx
import json
import logging
from config import NVIDIA_API_KEY, NVIDIA_CHAT_MODEL, NVIDIA_BASE_URL
from database import add_memory

logger = logging.getLogger("memory_engine")

async def extract_memories_and_summary(transcript: list, current_user_name: str) -> dict:
    """
    Analyzes conversation transcript, extracts new personal facts to remember,
    determines caller mood, and writes a cute friendly call summary.
    """
    if not transcript or len(transcript) < 2:
        return {
            "summary": "Short quick check-in call.",
            "mood": "neutral",
            "new_facts": []
        }

    dialogue_text = "\n".join([f"{item['sender']}: {item['text']}" for item in transcript])

    prompt = f"""You are the memory engine for an AI companion.
Analyze this conversation transcript between user ({current_user_name}) and the AI friend:

{dialogue_text}

Task:
1. Extract 1 to 3 important new personal facts or preferences about {current_user_name} (e.g., life events, exams, job details, favorites, feelings, people mentioned). Only extract clear, memorable facts. Do not make up facts.
2. Provide a 1-sentence friendly call summary from the AI friend's perspective.
3. Detect the user's primary emotional mood (e.g. 'happy', 'stressed', 'excited', 'tired', 'relaxed', 'sad').

Respond ONLY with valid JSON in this exact structure:
{{
  "summary": "...",
  "mood": "...",
  "new_facts": [
    {{"fact": "...", "category": "work|health|hobby|emotion|general"}}
  ]
}}
"""

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": NVIDIA_CHAT_MODEL,
        "messages": [
            {"role": "system", "content": "You are a precise JSON extractor. Output valid JSON only with no markdown backticks."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 300
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(NVIDIA_BASE_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                raw_content = resp.json()["choices"][0]["message"]["content"].strip()
                # Clean any markdown fences if model outputs them
                if raw_content.startswith("```"):
                    raw_content = raw_content.split("```")[1]
                    if raw_content.startswith("json"):
                        raw_content = raw_content[4:]
                raw_content = raw_content.strip()

                parsed = json.loads(raw_content)
                # Save new facts into database
                for item in parsed.get("new_facts", []):
                    if item.get("fact"):
                        add_memory(item["fact"], item.get("category", "general"))

                return parsed
    except Exception as e:
        logger.error(f"Failed to extract memory: {e}")

    return {
        "summary": "Heart-to-heart conversation with your AI friend.",
        "mood": "good",
        "new_facts": []
    }
