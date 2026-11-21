#Requires -RunAsAdministrator
param([int]$Port = 8787)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid port' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$configuration = Get-Content -LiteralPath (Join-Path $projectRoot 'server/.env')
$allowedLine = $configuration | Where-Object { $_ -match '^ALLOWED_HOSTS=' } | Select-Object -First 1
if (-not $allowedLine) { throw 'Configure ALLOWED_HOSTS in server/.env first.' }
$allowedAddresses = ($allowedLine -replace '^ALLOWED_HOSTS=', '').Split(',') | ForEach-Object { $_.Trim() }
$networkAddress = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -in $allowedAddresses -and $_.IPAddress -notmatch '^127\.' } | Select-Object -First 1
if (-not $networkAddress) { throw 'No current network address matches ALLOWED_HOSTS. Update server/.env for your Wi-Fi address.' }
$profile = Get-NetConnectionProfile -InterfaceIndex $networkAddress.InterfaceIndex
if ($profile.NetworkCategory -ne 'Private') { throw 'This rule is limited to a trusted Private network. Use a trusted private Wi-Fi network first.' }
$ruleName = "CyberGarden-Mobile-$Port-Private"
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    Set-NetFirewallRule -Name $ruleName -Enabled True -Direction Inbound -Action Allow -Profile Private -InterfaceAlias $networkAddress.InterfaceAlias
    Get-NetFirewallRule -Name $ruleName | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $Port
    Get-NetFirewallRule -Name $ruleName | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -LocalAddress $networkAddress.IPAddress -RemoteAddress LocalSubnet
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName "Cyber Garden mobile local API ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $networkAddress.IPAddress -RemoteAddress LocalSubnet -Profile Private -InterfaceAlias $networkAddress.InterfaceAlias | Out-Null
}
Write-Host "Enabled local Wi-Fi access: http://$($networkAddress.IPAddress):$Port/health"
Write-Host 'The rule allows this port only, from the local subnet, on this Private network adapter.'
