@echo off
rem KhoGuard - dong cac dich vu do run.bat mo (broker du an, backend, dashboard, mo phong, gateway Wokwi).
rem Khong dung MySQL, service Mosquitto 1883 hay node cua chuong trinh khac.
rem   close.bat        dung tat ca
rem   close.bat list   chi liet ke, khong dung
setlocal
rem Double-click: keep the window open at the end so the messages can be read.
if "%KG_INNER%"=="" (
  set "KG_INNER=1"
  call "%~f0" %*
  echo %cmdcmdline% | findstr /i /c:" /c " >nul && pause
  exit /b
)
chcp 65001 >nul
cd /d "%~dp0"
echo.
if /i "%~1"=="list" (
  echo === Tiến trình KhoGuard đang chạy ===
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-demo.ps1 -List
  exit /b
)
echo === Đóng KhoGuard ===
echo Lưu ý: tắt Wokwi Simulator trong VS Code bằng tay ^(F1 ^> Wokwi: Stop Simulator^).
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-demo.ps1
exit /b
