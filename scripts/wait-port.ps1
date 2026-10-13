# Used by run.bat: exit 0 once 127.0.0.1:<Port> accepts a connection, 1 after <Seconds> (0 = check once).
param([Parameter(Mandatory)][int]$Port, [int]$Seconds = 0)
$deadline = (Get-Date).AddSeconds($Seconds)
do {
    $client = [Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $Port); exit 0 }
    catch { Start-Sleep -Milliseconds 500 }
    finally { $client.Dispose() }
} while ((Get-Date) -lt $deadline)
exit 1
