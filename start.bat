@echo off
rem Startet den Verduennungsrechner lokal und oeffnet ihn im Browser.
rem Fenster offen lassen, solange die App benutzt wird.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)
node tools\serve.js 8080 --open
pause
