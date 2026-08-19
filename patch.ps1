# 9Router Token Saving Patch (Windows PowerShell Launcher)
$ErrorActionPreference = "Stop"

Write-Host "⚡ Fetching and executing 9Router Token Saving Patch..." -ForegroundColor Cyan

$tempFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "9router-patch-$([System.Guid]::NewGuid().ToString()).js")
try {
    $scriptUrl = "https://raw.githubusercontent.com/ehsandftm/9router-token-saving-patch/main/patch.js"
    Invoke-WebRequest -Uri $scriptUrl -OutFile $tempFile -UseBasicParsing
    & node $tempFile @args
} finally {
    if (Test-Path $tempFile) {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
}
