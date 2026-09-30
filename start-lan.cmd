@echo off
rem Double-click to open the game to friends on this network (npm run lan): it builds the game, then serves it until
rem this window is closed. Open http://localhost:4173 in Chrome on this computer to host; friends open the address
rem printed below. Run from its own window, not the Claude app's preview, which may stop it in the middle of a game.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing the game's tools, once...
  call npm ci || goto end
)
call npm run lan
:end
echo.
pause
