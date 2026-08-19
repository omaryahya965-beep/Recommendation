# Starts the user-space PostgreSQL 17 dev instance (port 5433).
# Created because the machine's main PostgreSQL service password is not
# available; this instance lives in %LOCALAPPDATA%\audit_tracker_pg and is
# fully independent of the system service.
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$dataDir = "$env:LOCALAPPDATA\audit_tracker_pg"

$status = & "$pgBin\pg_ctl.exe" -D $dataDir status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Output "Dev Postgres already running (port 5433)."
} else {
    & "$pgBin\pg_ctl.exe" -D $dataDir -o "-p 5433" -l "$dataDir\server.log" start
}
