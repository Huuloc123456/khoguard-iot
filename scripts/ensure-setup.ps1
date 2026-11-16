# Called by run.bat before starting services: installs or repairs whatever this machine is still missing,
# then exits 0. Every step is skipped when its output already exists, so a configured machine only pays for
# `db:migrate` (about 0.3 s) and a firmware rebuild when a source file is newer than firmware.bin.
# Software (Node.js, MySQL Server, Mosquitto, VS Code) is never installed here; a missing one stops with the command to install it.
param([ValidateSet('wokwi', 'web')][string]$Mode = 'wokwi')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$local = Join-Path $root '.local'

function Say($text) { Write-Host $text }
function Stop-Setup($text) { Write-Host "[LỖI] $text" -ForegroundColor Red; exit 1 }
function Invoke-Npm($script, $label) {
    Say "[CÀI] $label ..."
    if ($script -eq 'ci') { & npm.cmd ci --no-audit --no-fund } else { & npm.cmd run --silent $script }
    if ($LASTEXITCODE -ne 0) { Stop-Setup "$label thất bại (npm.cmd $(if ($script -eq 'ci') { 'ci' } else { "run $script" })). Xem thông báo phía trên." }
}
function Newest($paths) {
    $files = foreach ($p in $paths) { if (Test-Path -LiteralPath $p) { Get-ChildItem -LiteralPath $p -File -Recurse } }
    ($files | Measure-Object LastWriteTimeUtc -Maximum).Maximum
}
function PortOpen($port) {
    $client = [Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $port); $true } catch { $false } finally { $client.Dispose() }
}

# 1. Software that must already be installed.
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { Stop-Setup 'Chưa có Node.js. Cài bản LTS: winget install OpenJS.NodeJS.LTS, rồi mở lại run.bat.' }
if (-not (Test-Path -LiteralPath 'C:\Program Files\Mosquitto\mosquitto.exe')) { Stop-Setup 'Chưa có Mosquitto. Cài: winget install EclipseFoundation.Mosquitto, rồi mở lại run.bat.' }
$mysql = Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $mysql) { Stop-Setup 'Chưa có service MySQL Server. Cài: winget install Oracle.MySQL (nhớ mật khẩu root), rồi mở lại run.bat.' }
if ($mysql.Status -ne 'Running') {
    try { Start-Service -InputObject $mysql; Say "[MỞ] Service $($mysql.Name) đã được khởi động." }
    catch { Stop-Setup "Service $($mysql.Name) đang tắt và cần quyền quản trị để bật. Mở services.msc, Start $($mysql.Name), rồi chạy lại run.bat." }
}

# 2. Node packages: install on first run and again whenever package-lock.json changes (for example after git pull).
$installed = Join-Path $root 'node_modules\.package-lock.json'
if (-not (Test-Path -LiteralPath $installed) -or (Get-Item 'package-lock.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath $installed).LastWriteTimeUtc) {
    Invoke-Npm 'ci' 'Cài thư viện Node (npm ci)'
}

# 3. Protected .local, broker accounts and runtime.env.
if (-not (Test-Path -LiteralPath (Join-Path $local 'runtime.env'))) { Invoke-Npm 'infra:setup' 'Tạo cấu hình cục bộ .local' }

# 4. Database: ask once for a MySQL admin account, create the project schema and accounts, then migrate on every start.
if (-not (Test-Path -LiteralPath (Join-Path $local 'mysql-state.json'))) {
    $adminFile = Join-Path $local 'mysql-admin.env'
    $text = if (Test-Path -LiteralPath $adminFile) { [IO.File]::ReadAllText($adminFile) } else { '' }
    if ($text -notmatch '(?m)^MYSQL_ADMIN_PASSWORD=\S') {
        Say ''
        Say 'Lần đầu cần một tài khoản MySQL có quyền tạo database (thường là root) để tạo schema khoguard_demo.'
        Say 'Mật khẩu chỉ lưu trong .local\mysql-admin.env trên máy này.'
        $user = Read-Host 'Tài khoản MySQL [root]'
        if (-not $user) { $user = 'root' }
        $secure = Read-Host "Mật khẩu của $user" -AsSecureString
        $password = [Net.NetworkCredential]::new('', $secure).Password
        if (-not $password) { Stop-Setup 'Chưa nhập mật khẩu MySQL.' }
        # node:util parseEnv reads quoted values literally; pick a quote the password does not contain.
        $quote = @('"', "'", '`') | Where-Object { -not $password.Contains($_) } | Select-Object -First 1
        if (-not $quote -or $user -match '\s|=') { Stop-Setup 'Tài khoản hoặc mật khẩu MySQL có ký tự không hỗ trợ; điền tay vào .local\mysql-admin.env.' }
        [IO.File]::WriteAllText($adminFile, "MYSQL_ADMIN_USER=$user`nMYSQL_ADMIN_PASSWORD=$quote$password$quote`n", [Text.UTF8Encoding]::new($false))
    }
    Say '[CÀI] Tạo database khoguard_demo và tài khoản riêng ...'
    & npm.cmd run --silent infra:db:init
    if ($LASTEXITCODE -ne 0) {
        # Forget the saved password so the next run.bat asks again instead of repeating the same failure.
        $userLine = ([IO.File]::ReadAllText($adminFile) -split '\r?\n' | Where-Object { $_ -match '^MYSQL_ADMIN_USER=' } | Select-Object -First 1)
        [IO.File]::WriteAllText($adminFile, "$userLine`nMYSQL_ADMIN_PASSWORD=`n", [Text.UTF8Encoding]::new($false))
        Stop-Setup 'Không tạo được database. Thường do sai tài khoản/mật khẩu MySQL; chạy lại run.bat để nhập lại (xem thông báo phía trên).'
    }
}
Invoke-Npm 'db:migrate' 'Cập nhật cấu trúc database (migration)'
if (-not (Test-Path -LiteralPath (Join-Path $local 'dashboard-users.json'))) { Invoke-Npm 'auth:setup' 'Tạo tài khoản dashboard viewer/operator/admin' }

# 5. Demo CA and broker certificate; setup-tls rewrites the broker config, so the project broker must be stopped.
if (-not (Test-Path -LiteralPath (Join-Path $local 'tls\ca.crt'))) {
    if (PortOpen 18884) { Stop-Setup 'Cần tạo chứng chỉ TLS nhưng broker dự án đang chạy. Chạy close.bat rồi mở lại run.bat.' }
    Invoke-Npm 'infra:tls:setup' 'Tạo chứng chỉ TLS cho broker'
}

if ($Mode -eq 'wokwi') {
    # 6. Wokwi gateway (official release, SHA256 checked by setup-wokwi.ps1).
    if (-not (Test-Path -LiteralPath (Join-Path $local 'wokwigw-2.0.1\wokwigw.exe'))) { Invoke-Npm 'firmware:gateway:setup' 'Tải gateway Wokwi' }

    # 7. Firmware: build when missing or older than any source or the generated secrets header.
    $bin = Join-Path $local 'firmware-build\esp32dev\firmware.bin'
    $sources = @('firmware\src', 'firmware\include', 'firmware\lib', 'firmware\platformio.ini', (Join-Path $local 'tls\ca.crt'))
    $stale = -not (Test-Path -LiteralPath $bin) -or (Newest $sources) -gt (Get-Item -LiteralPath $bin).LastWriteTimeUtc
    if ($stale) {
        if (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.platformio\penv\Scripts\pio.exe')) {
            Invoke-Npm 'firmware:build' 'Biên dịch firmware ESP32 (lần đầu có thể mất vài phút)'
            # PlatformIO leaves firmware.bin untouched when the output is identical; stamp it so the next start skips the build.
            (Get-Item -LiteralPath $bin).LastWriteTimeUtc = [DateTime]::UtcNow
        }
        elseif (Test-Path -LiteralPath $bin) { Say '[CẢNH BÁO] Firmware cũ hơn mã nguồn nhưng chưa có PlatformIO để build lại; Wokwi sẽ chạy bản cũ.' }
        else { Stop-Setup 'Chưa có PlatformIO để build firmware. Mở VS Code, cài extension PlatformIO IDE, chờ cài xong rồi chạy lại run.bat (hoặc dùng run.bat web).' }
    }
    if (Get-Command code -ErrorAction SilentlyContinue) {
        $extensions = & code --list-extensions 2>$null
        if ($extensions -notcontains 'wokwi.wokwi-vscode') { Say '[CẢNH BÁO] VS Code chưa có extension Wokwi. Cài: code --install-extension wokwi.wokwi-vscode' }
    }
}
Say '[OK] Máy đã cấu hình đủ.'
exit 0
