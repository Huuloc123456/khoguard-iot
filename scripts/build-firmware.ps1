$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$pioExecutable = Join-Path $env:USERPROFILE '.platformio\penv\Scripts\pio.exe'
if (-not (Test-Path -LiteralPath $pioExecutable)) {
    throw 'PlatformIO Core is missing. Install/open PlatformIO in VS Code first.'
}
& node (Join-Path $PSScriptRoot 'prepare-firmware.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $pioExecutable run --project-dir (Join-Path $projectRoot 'firmware')
exit $LASTEXITCODE
