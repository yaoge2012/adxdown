@echo off
cd /d %~dp0
set PYTHONIOENCODING=utf-8
echo.
echo ============================================
echo   ADX Download - Metadata Update
echo ============================================
python scripts\generate_metadata.py
if errorlevel 1 (
    echo.
    echo [ERROR] Python script failed.
    pause
    exit /b 1
)
echo.
echo Metadata updated. Restart server to load changes.
pause
