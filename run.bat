@echo off
title AI Friend Web Calling App (Nila)
cd /d "%~dp0\ai_friend_app"
echo ========================================================
echo   Starting AI Friend Voice Call Platform (Nila)
echo   Languages: Tanglish, Tamil, English
echo   Voice: Sarvam Bulbul v3 / Brain: NVIDIA Gemma 4 31B
echo ========================================================
echo Server starting at: http://localhost:8000
python -m uvicorn server:app --host 127.0.0.1 --port 8000
pause
