@echo off
rem One zone C, ESP-C01, D07-D08. run.bat web skips Wokwi; status is read-only.
rem KhoGuard - mo nhanh cac dich vu demo. Huong dan day du: docs\HUONG_DAN_DEMO.md
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
set "MODE=%~1"
if "%MODE%"=="" set "MODE=wokwi"
if /i not "%MODE%"=="wokwi" if /i not "%MODE%"=="web" if /i not "%MODE%"=="status" (
  echo Cách dùng: run.bat [wokwi^|web^|status]
  exit /b 1
)
set "PORTCHECK=powershell -NoProfile -ExecutionPolicy Bypass -File scripts\wait-port.ps1"

if /i "%MODE%"=="status" goto :status

if not exist ".local\runtime.env" (
  echo [LỖI] Chưa cấu hình máy này: thiếu .local\runtime.env. Làm theo docs\HUONG_DAN_CAU_HINH.md trước.
  exit /b 1
)
where npm.cmd >nul 2>&1 || (echo [LỖI] Không tìm thấy npm.cmd. Cài Node.js trước. & exit /b 1)
if not exist "node_modules" (
  echo [LỖI] Chưa cài thư viện. Chạy: npm.cmd ci
  exit /b 1
)
powershell -NoProfile -Command "if (Get-Service MySQL* -ErrorAction SilentlyContinue | Where-Object Status -eq 'Running') { exit 0 } else { exit 1 }" || (
  echo [CẢNH BÁO] Service MySQL chưa chạy. Mở services.msc và Start MySQL, backend sẽ báo database unavailable cho tới khi MySQL chạy.
)

echo.
echo === KhoGuard: khởi động chế độ %MODE% ===
call :launch 18884 "T1 Broker" "npm.cmd run infra:mqtt:start" 15 || goto :failed
call :launch 3001 "T2 Backend" "npm.cmd run backend:start" 30 || goto :failed
call :launch 5173 "T3 Dashboard" "npm.cmd run dev -- --strictPort" 30 || goto :failed

if exist ".local\thingsboard-cloud.json" (
  powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object CommandLine -match 'scripts[/\\]thingsboard\.mjs bridge') { exit 0 } else { exit 1 }" && (
    echo [BỎ QUA] Bridge ThingsBoard đã chạy.
  ) || (
    start "KhoGuard-T4 ThingsBoard" cmd /k "cd /d %~dp0 & title KhoGuard-T4 ThingsBoard & npm.cmd run thingsboard:bridge"
  )
)

if /i "%MODE%"=="wokwi" (
  if not exist ".local\wokwigw-2.0.1\wokwigw.exe" (
    echo [LỖI] Chưa có gateway Wokwi. Chạy: npm.cmd run firmware:gateway:setup
    goto :failed
  )
  for %%E in (esp32dev) do if not exist ".local\firmware-build\%%E\firmware.bin" echo [CẢNH BÁO] Chưa có firmware %%E. Chạy: npm.cmd run firmware:build
  call :launch 9011 "T5 Gateway Wokwi" "npm.cmd run firmware:gateway:start" 15 || goto :failed
  where code >nul 2>&1 || echo [CẢNH BÁO] Không tìm thấy lệnh code. Mở bằng VS Code thủ công: firmware.
  where code >nul 2>&1 && for %%F in (firmware) do call code --new-window "%~dp0%%F"
)

start "" "http://127.0.0.1:5173"
echo.
echo === Đã mở xong ===
echo  - Dashboard: http://127.0.0.1:5173  ^(Nguồn dữ liệu: Backend / MQTT, đăng nhập operator^)
if /i "%MODE%"=="wokwi" (
  echo  - Trong cửa sổ VS Code firmware: F1 ^> Wokwi: Start Simulator, giữ tab Simulator hiển thị.
  echo    Serial Monitor: ESP-C01 phải có MQTT_ONLINE. Chỉ chạy một Simulator.
)
echo  - Đóng tất cả: close.bat
exit /b 0

:launch
rem %1 cổng, %2 tên cửa sổ, %3 lệnh, %4 số giây chờ cổng mở
%PORTCHECK% -Port %1 >nul 2>&1 && (
  echo [BỎ QUA] %~2 đã chạy ^(cổng %1 đang mở^).
  exit /b 0
)
echo [MỞ] %~2 ...
start "KhoGuard-%~2" cmd /k "cd /d %~dp0 & title KhoGuard-%~2 & %~3"
%PORTCHECK% -Port %1 -Seconds %4 >nul 2>&1 && (
  echo       sẵn sàng ở cổng %1.
  exit /b 0
)
echo [LỖI] %~2 không mở cổng %1 sau %4 giây. Xem cửa sổ "KhoGuard-%~2" để biết lỗi.
exit /b 1

:status
echo.
echo === Trạng thái KhoGuard ===
call :show 18884 "Broker MQTT       "
call :show 18885 "Broker MQTT TLS   "
call :show 3001  "Backend           "
call :show 5173  "Dashboard         "
call :show 9011  "Gateway Wokwi     "
exit /b 0

:show
%PORTCHECK% -Port %1 >nul 2>&1 && (echo   %~2: đang chạy ^(cổng %1^)) || (echo   %~2: đã tắt)
exit /b 0

:failed
echo.
echo Khởi động dừng giữa chừng. Sửa lỗi ở trên rồi chạy lại run.bat ^(các phần đã chạy sẽ được bỏ qua^).
exit /b 1
