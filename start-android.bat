@echo off
echo ========================================
echo IoT Sign Language - Mobile App Launcher
echo ========================================
echo.
echo Starting Metro Bundler...
echo.
cd /d "%~dp0"
start "Metro Bundler" cmd /k "npx expo start --port 8082"
echo.
echo Waiting for Metro to start...
timeout /t 5 /nobreak >nul
echo.
echo Launching Android Emulator...
echo.
call npm run android
echo.
echo ========================================
echo App should now be loading on emulator!
echo Keep the Metro Bundler terminal open!
echo ========================================
pause




