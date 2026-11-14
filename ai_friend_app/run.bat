@echo off
title AI Friend Web Calling App (Nila)
cd /d "%~dp0"
echo Starting server at http://localhost:8000
python -m uvicorn server:app --host 127.0.0.1 --port 8000
pause
