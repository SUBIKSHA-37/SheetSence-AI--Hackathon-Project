$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiPython = Join-Path $root 'backend\.venv\Scripts\python.exe'
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

if (-not (Test-Path $apiPython)) {
    throw 'Backend environment is missing. Follow the setup steps in README.md first.'
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    throw 'Frontend dependencies are missing. Run npm install in the frontend folder first.'
}

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        return $result.AsyncWaitHandle.WaitOne(250) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (-not (Test-LocalPort 8000)) {
    Start-Process -FilePath $apiPython -ArgumentList @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backend -WindowStyle Hidden | Out-Null
}
if (-not (Test-LocalPort 5173)) {
    $npm = (Get-Command npm.cmd).Source
    Start-Process -FilePath $npm -ArgumentList @('run', 'dev', '--', '--port', '5173') -WorkingDirectory $frontend -WindowStyle Hidden | Out-Null
}

Write-Host 'SheetSense AI is starting.'
Write-Host 'Dashboard: http://localhost:5173'
Write-Host 'API docs:  http://localhost:8000/docs'
