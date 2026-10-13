$ErrorActionPreference = 'Stop'
function Get-Sha256($path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateRoot = Join-Path $projectRoot '.local'
if (-not (Test-Path -LiteralPath $privateRoot)) { throw 'Run infra:setup first to create protected .local.' }
if ((Get-Item -LiteralPath $privateRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '.local must not be a link.' }
$gatewayDirectory = Join-Path $privateRoot 'wokwigw-2.0.1'
New-Item -ItemType Directory -Path $gatewayDirectory -Force | Out-Null
if ((Get-Item -LiteralPath $gatewayDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Gateway directory must not be a link.' }
$archive = Join-Path $gatewayDirectory 'wokwigw.zip'
$executable = Join-Path $gatewayDirectory 'wokwigw.exe'
$archiveSha = 'e2152107d94121c3cf9f34054cd9c947d17a25c2c95d8b7e91bba36a3536e485'
$executableSha = '76bbd0d9be5069ff3df70c4b56dd7057a04df4256be2f3e223ffd48b6c3c4a01'
# SHA256 from the official v2.0.1 release; executable hash from that verified archive.
if (Test-Path -LiteralPath $executable) {
    if ((Get-Sha256 $executable) -eq $executableSha) {
        Write-Output 'Wokwi native gateway 2.0.1 already installed; executable SHA256 verified.'
        exit 0
    }
    throw 'Gateway executable has changed; do not run it. Check the local installation.'
}
& curl.exe --fail --location --silent --show-error --connect-timeout 15 --max-time 120 --output $archive 'https://github.com/wokwi/wokwigw/releases/download/v2.0.1/wokwigw_v2.0.1_Windows_64bit.zip'
if ($LASTEXITCODE -ne 0) { throw 'Gateway download failed.' }
if ((Get-Sha256 $archive) -ne $archiveSha) { throw 'Gateway archive SHA256 mismatch.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($archive, $gatewayDirectory)
if ((Get-Sha256 $executable) -ne $executableSha) { throw 'Gateway executable SHA256 mismatch.' }
Write-Output 'Wokwi native gateway 2.0.1 installed under .local; archive/executable SHA256 verified.'
