$ErrorActionPreference = "Stop"
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$dataDir = Join-Path $PSScriptRoot "..\.pgdata"
$logFile = Join-Path $dataDir "pg.log"

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  throw "No local cluster at $dataDir. Ask the agent to recreate it, or run initdb there."
}

& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 5433 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Output "Postgres already running on 5433"
  exit 0
}

& "$pgBin\pg_ctl.exe" -D $dataDir -l $logFile -o "-p 5433" start
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $logFile) { Get-Content $logFile -Tail 40 }
  throw "pg_ctl start failed"
}
Write-Output "Postgres started on 5433"
