param(
  [Parameter(Mandatory = $true)][string]$ServerUrl,
  [Parameter(Mandatory = $true)][string]$AgentKey,
  [string]$AgentId = "office-pc",
  [ValidateSet("sharp_pcfax", "windows_fax")][string]$Mode = "sharp_pcfax",
  [string]$PrinterName = "SHARP MX-2661 FAX"
)

$ErrorActionPreference = "Stop"
if (-not $ServerUrl.StartsWith("https://")) { throw "ServerUrl must use HTTPS." }
$sourceExe = Join-Path $PSScriptRoot "dist\FaxMailAgent.exe"
if (-not (Test-Path -LiteralPath $sourceExe)) { throw "Build desktop-agent\dist\FaxMailAgent.exe first." }

$installDir = Join-Path $env:LOCALAPPDATA "FaxMailAgent"
$configDir = Join-Path $env:APPDATA "FaxMailAgent"
New-Item -ItemType Directory -Force -Path $installDir, $configDir | Out-Null
$installedExe = Join-Path $installDir "FaxMailAgent.exe"
Get-Process FaxMailAgent -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Copy-Item -LiteralPath $sourceExe -Destination $installedExe -Force

$sumatraCandidates = @(
  (Join-Path $env:LOCALAPPDATA "SumatraPDF\SumatraPDF.exe"),
  (Join-Path $env:ProgramFiles "SumatraPDF\SumatraPDF.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "SumatraPDF\SumatraPDF.exe")
)
$pdfViewer = $sumatraCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($Mode -eq "sharp_pcfax" -and -not $pdfViewer) { throw "SumatraPDF.exe was not found." }

$config = [ordered]@{
  server_url = $ServerUrl.TrimEnd("/")
  agent_id = $AgentId
  agent_key = $AgentKey
  mode = $Mode
  printer_name = $PrinterName
  pdf_viewer = $pdfViewer
  recipient_window = ".*相手先の選択.*"
  dialog_timeout_seconds = 60
  fax_server = ""
  poll_seconds = 5
}
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $configDir "config.json") -Encoding UTF8

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $runKey -Name "FaxMailAgent" -Value ('"' + $installedExe + '"') -PropertyType String -Force | Out-Null
Start-Process -FilePath $installedExe -WorkingDirectory $installDir -WindowStyle Hidden
Write-Host "Fax Mail Agent installed and started. Log: $installDir\agent.log"
