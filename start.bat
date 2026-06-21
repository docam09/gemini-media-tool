@echo off
REM Nhap dup vao file nay de cai va chay app "Theo doi tien do nhom".
REM No goi run.ps1 voi quyen Bypass de khong bi PowerShell chan script.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0run.ps1"
echo.
echo Neu cua so backend/frontend da mo, ban co the dong cua so nay.
pause
