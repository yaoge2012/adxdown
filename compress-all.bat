@echo off
cd /d %~dp0
set PYTHONIOENCODING=utf-8
echo.
echo ============================================
echo   Compress unpacked chart folders to zip
echo ============================================
python scripts\compress_folders.py
if errorlevel 1 (
    echo.
    echo [ERROR] Compression failed.
    pause
    exit /b 1
)
echo.
echo Done. Run update_metadata.bat to refresh cache.
pause
