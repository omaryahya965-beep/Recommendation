# Starts the isolated PostgreSQL 17 cluster used ONLY by automated tests and
# the local E2E backend (port 5434). It is separate from the development
# database (port 5433, start_db.ps1) and from Neon, so running the test suite
# or the browser tests can never touch real data.
#
# First run initialises the cluster in %LOCALAPPDATA%\raqeeb_test_pg with
# trust authentication bound to localhost only.
#
#   powershell -File backend\scripts\start_test_db.ps1
#   cd backend; .\venv\Scripts\python.exe manage.py test
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$dataDir = "$env:LOCALAPPDATA\raqeeb_test_pg"

if (-not (Test-Path "$dataDir\PG_VERSION")) {
    & "$pgBin\initdb.exe" -D $dataDir -U postgres -A trust -E UTF8 --locale=C
}

$null = & "$pgBin\pg_ctl.exe" -D $dataDir status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Output "Test Postgres already running (port 5434)."
} else {
    Start-Process -FilePath "$pgBin\pg_ctl.exe" -WindowStyle Hidden -ArgumentList @(
        "-D", "`"$dataDir`"",
        "-o", "`"-p 5434 -c listen_addresses=localhost`"",
        "-l", "`"$dataDir\server.log`"",
        "start"
    )
    Start-Sleep -Seconds 3
    Write-Output "Test Postgres started on port 5434."
}
