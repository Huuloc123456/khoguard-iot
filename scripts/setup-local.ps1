$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskLocal = Join-Path $taskRoot '.local'
if (Test-Path -LiteralPath $taskLocal) {
  if ((Get-Item -LiteralPath $taskLocal).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '.local must not be a symlink or junction' }
} else { New-Item -ItemType Directory -Path $taskLocal | Out-Null }
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$taskAcl = New-Object Security.AccessControl.DirectorySecurity
$taskAcl.SetOwner($taskIdentity)
$taskAcl.SetAccessRuleProtection($true, $false)
$taskAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($taskIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
$taskAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.SecurityIdentifier]'S-1-5-18', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
if ($PSVersionTable.PSVersion.Major -ge 6) {
  [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($taskLocal), $taskAcl)
} else {
  [IO.Directory]::SetAccessControl($taskLocal, $taskAcl)
}
& node (Join-Path $PSScriptRoot 'setup-mqtt.mjs')
if ($LASTEXITCODE -ne 0) { throw 'MQTT setup failed' }
