@echo off
title AI Voice Companion (Wi-Fi Enabled)
cd /d "%~dp0\ai_friend_app"
echo ========================================================
echo   Starting AI Voice Companion (Wi-Fi Enabled)
echo   Local PC:     https://localhost:8000
echo   Phone/Wi-Fi:  https://192.168.0.190:8000
echo ========================================================
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
pause
