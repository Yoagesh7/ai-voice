import os

def load_dotenv():
    # Look for .env in current directory or parent
    paths = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env")
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            os.environ.setdefault(k.strip(), v.strip())
            except Exception:
                pass

load_dotenv()

# API Keys
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

# Models
NVIDIA_CHAT_MODEL = os.environ.get("NVIDIA_CHAT_MODEL", "google/gemma-4-31b-it")
SARVAM_TTS_MODEL = "bulbul:v3"
SARVAM_STT_MODEL = "saaras:v3"

# Endpoints
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

# Database
DB_PATH = os.path.join(os.path.dirname(__file__), "friend_memory.db")
