# Used by close.bat: stops only what run.bat started for this project.
# Never touches MySQL, the Mosquitto service on 1883 or node processes of other projects.
param([switch]$List)
$ErrorActionPreference = 'Stop'
$root = (Split-Path -Parent $PSScriptRoot).TrimEnd('\')
$gateway = Join-Path $root '.local\wokwigw-2.0.1\wokwigw.exe'

function Find-Targets {
    $all = Get-CimInstance Win32_Process
    # Windows opened by run.bat carry this marker in their command line; killing their tree stops npm, node, mosquitto and the gateway inside.
    $windows = @($all | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*title KhoGuard-T*' -and $_.CommandLine -like "*$root*" })
    # Anything left over (window closed by hand, started from another terminal) is matched by the exact project script or path.
    # Only these entry points: other node processes may mention the project path too (editors, agents) and must survive.
    $leftovers = @($all | Where-Object {
        ($_.Name -eq 'mosquitto.exe' -and $_.CommandLine -like '*\.local\mosquitto\mosquitto.conf*' -and $_.CommandLine -like "*$root*") -or
        ($_.Name -eq 'wokwigw.exe' -and $_.ExecutablePath -eq $gateway) -or
        ($_.Name -eq 'node.exe' -and (
            $_.CommandLine -like "*$root\node_modules\vite\*" -or
            $_.CommandLine -like "*$root\server\start.mjs*" -or
            $_.CommandLine -like "*$root\scripts\start-mqtt.mjs*" -or
            ($_.CommandLine -like "*$root\scripts\thingsboard.mjs*" -and $_.CommandLine -match '\sbridge(\s|$)')))
    })
    [pscustomobject]@{ Windows = $windows; Leftovers = $leftovers }
}

$found = Find-Targets
if (-not $found.Windows.Count -and -not $found.Leftovers.Count) { Write-Host 'Khong co tien trinh KhoGuard nao dang chay.'; exit 0 }
foreach ($p in @($found.Windows) + @($found.Leftovers)) {
    $line = [string]$p.CommandLine
    if ($line.Length -gt 110) { $line = $line.Substring(0, 110) + '...' }
    Write-Host ("  PID {0,-6} {1,-14} {2}" -f $p.ProcessId, $p.Name, $line)
}
if ($List) { exit 0 }

foreach ($w in $found.Windows) { & taskkill.exe /PID $w.ProcessId /T /F *> $null }
Start-Sleep -Milliseconds 500
foreach ($p in (Find-Targets).Leftovers) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { Write-Warning "Khong dung duoc PID $($p.ProcessId): $($_.Exception.Message)" }
}
$remaining = Find-Targets
if ($remaining.Windows.Count -or $remaining.Leftovers.Count) { Write-Warning 'Van con tien trinh KhoGuard; chay lai close.bat hoac dong tay.'; exit 1 }
Write-Host 'Da dung tat ca tien trinh KhoGuard.'
