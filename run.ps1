# run.ps1 — Bộ khởi chạy 1 chạm cho app "Theo dõi tiến độ nhóm" (Windows).
#
# Cách dùng đơn giản nhất: nhấp đúp vào file start.bat (nó gọi script này
# với ExecutionPolicy Bypass). Hoặc chạy trong PowerShell:
#     powershell -ExecutionPolicy Bypass -File .\run.ps1
#
# Script sẽ: tạo môi trường ảo Python + cài deps backend, cài deps frontend
# (chỉ lần đầu), rồi mở 2 cửa sổ chạy backend (:8000) và frontend (:5173),
# cuối cùng mở trình duyệt tới http://localhost:5173/.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

Write-Host "==> Thu muc du an: $root" -ForegroundColor Cyan

# --------------------------------------------------------------------------
# Backend: tao venv + cai dependencies
# --------------------------------------------------------------------------
$backend    = Join-Path $root "backend"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "==> Tao moi truong ao Python (.venv)..." -ForegroundColor Cyan
    Push-Location $backend
    if (Get-Command py -ErrorAction SilentlyContinue) {
        py -3.11 -m venv .venv
    } else {
        python -m venv .venv
    }
    Pop-Location
}

Write-Host "==> Cai dependencies backend (co the mat 1-2 phut lan dau)..." -ForegroundColor Cyan
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $backend "requirements.txt")

# --------------------------------------------------------------------------
# Frontend: cai node_modules (chi lan dau)
# --------------------------------------------------------------------------
$frontend = Join-Path $root "frontend"
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "==> Cai dependencies frontend (npm install)..." -ForegroundColor Cyan
    Push-Location $frontend
    npm install
    Pop-Location
}

# --------------------------------------------------------------------------
# Mo cong tuong lua 5173 de may khac trong mang LAN truy cap duoc
# (can quyen Administrator; neu khong co se huong dan thu cong)
# --------------------------------------------------------------------------
$ruleName = "Team Progress Tracker (5173)"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    if ($isAdmin) {
        Write-Host "==> Mo cong tuong lua 5173 cho mang LAN..." -ForegroundColor Cyan
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort 5173 `
            -Protocol TCP -Action Allow -Profile Private | Out-Null
    } else {
        Write-Host "!! Chua mo cong tuong lua (can quyen Admin). Neu may khac KHONG vao duoc," -ForegroundColor Yellow
        Write-Host "   mo PowerShell bang 'Run as administrator' va chay 1 lan lenh:" -ForegroundColor Yellow
        Write-Host "   New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow" -ForegroundColor Yellow
    }
}

# --------------------------------------------------------------------------
# Khoi chay 2 server trong 2 cua so rieng
# --------------------------------------------------------------------------
Write-Host "==> Khoi dong backend tai cong 8000..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass", "-Command",
    "Set-Location '$backend'; & '$venvPython' -m uvicorn app.main:app --reload --port 8000"
)

Write-Host "==> Khoi dong frontend tai cong 5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass", "-Command",
    "Set-Location '$frontend'; npm run dev"
)

Write-Host "==> Cho frontend san sang..." -ForegroundColor Cyan
Start-Sleep -Seconds 7
Start-Process "http://localhost:5173/"

# Tim dia chi IP LAN (adapter dang hoat dong, co default gateway) de chia se.
$lanIp = $null
try {
    $lanIp = (Get-NetIPConfiguration |
        Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
        Select-Object -First 1).IPv4Address.IPAddress
} catch { }

Write-Host ""
Write-Host "Xong! Da mo 2 cua so (backend + frontend) va trinh duyet." -ForegroundColor Green
Write-Host "GIU NGUYEN 2 cua so do trong luc dung app. Dong chung lai = tat server." -ForegroundColor Yellow
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " CHIA SE CHO DONG NGHIEP (cung mang LAN/Wi-Fi cong ty):" -ForegroundColor Green
if ($lanIp) {
    Write-Host ("   http://{0}:5173/" -f $lanIp) -ForegroundColor White
} else {
    Write-Host "   http://<DIA-CHI-IP-MAY-NAY>:5173/   (chay 'ipconfig' de xem IPv4)" -ForegroundColor White
}
Write-Host " (May ban phai dang bat va giu 2 cua so server nay chay)" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
