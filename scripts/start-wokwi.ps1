$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$gatewayExecutable = Join-Path $projectRoot '.local\wokwigw-2.0.1\wokwigw.exe'
if (-not (Test-Path -LiteralPath $gatewayExecutable)) { throw 'Run firmware:gateway:setup first.' }
$sha = [Security.Cryptography.SHA256]::Create()
try { $digest = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($gatewayExecutable))).Replace('-', '').ToLowerInvariant() }
finally { $sha.Dispose() }
if ($digest -ne '76bbd0d9be5069ff3df70c4b56dd7057a04df4256be2f3e223ffd48b6c3c4a01') { throw 'Gateway executable SHA256 mismatch.' }
foreach ($port in @(9011, 9080)) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try { $listener.Start() }
    catch { throw "Port $port is occupied; do not stop unrelated processes." }
    finally { $listener.Stop() }
}
# shortcut: upstream forwards 9080 on all interfaces; restrict ingress before adding any simulator HTTP server.
& $gatewayExecutable --listenPort 9011
exit $LASTEXITCODE
