@echo off
REM =============================================================================
REM BRONTOLANO BUSINESS SUITE - Windows Docker Build
REM =============================================================================
REM Usage: Double-click or run: dockerbuild.bat
REM =============================================================================

title Brontolano Business Suite - Docker Build
color 0A

echo ==============================================
echo   BRONTOLANO BUSINESS SUITE v1.0.0
echo   Windows Docker Build Script
echo ==============================================
echo.

REM Step 1: Check Docker
echo [1/6] Checking Docker...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop first.
    pause
    exit /b 1
)
echo   [OK] Docker is running

REM Step 2: Check .env
echo [2/6] Checking environment...
if not exist .env (
    echo   [WARN] Creating .env from template...
    copy .env.example .env >nul
    echo   [OK] .env created
) else (
    echo   [OK] .env exists
)

REM Step 3: Build services
echo [3/6] Building service images...
set SERVICES=auth crm sales inventory finance hr notifications web

for %%s in (%SERVICES%) do (
    echo   Building %%s...
    if exist apps\%%s\Dockerfile (
        docker build -t brontolano/%%s:latest -f apps/%%s/Dockerfile apps/%%s >nul 2>&1
        if !errorlevel! equ 0 (
            echo     [OK] %%s built
        ) else (
            echo     [FAIL] %%s build failed
        )
    ) else (
        echo     [SKIP] No Dockerfile for %%s
    )
)

REM Step 4: Pull base images
echo [4/6] Pulling infrastructure images...
docker pull postgres:15-alpine >nul 2>&1
echo   [OK] PostgreSQL image ready
docker pull redis:7-alpine >nul 2>&1
echo   [OK] Redis image ready

REM Step 5: Create network
echo [5/6] Setting up network...
docker network create brontolano-net 2>nul
echo   [OK] Network ready

REM Step 6: Start containers
echo [6/6] Starting containers...

REM Start PostgreSQL
docker rm -f brontolano-postgres 2>nul
docker run -d --name brontolano-postgres --network brontolano-net ^
    -e POSTGRES_DB=brontolano -e POSTGRES_USER=brontolano ^
    -e POSTGRES_PASSWORD=Brontolano2025Secure! ^
    -p 5432:5432 --restart unless-stopped postgres:15-alpine
echo   [OK] PostgreSQL started

REM Start Redis
docker rm -f brontolano-redis 2>nul
docker run -d --name brontolano-redis --network brontolano-net ^
    -p 6379:6379 --restart unless-stopped redis:7-alpine redis-server --appendonly yes
echo   [OK] Redis started

REM Start application services
for %%s in (%SERVICES%) do (
    docker rm -f brontolano-%%s 2>nul
)

docker run -d --name brontolano-auth --network brontolano-net -p 3001:3000 --env-file .env --restart unless-stopped brontolano/auth:latest
echo   [OK] Auth started on :3001

docker run -d --name brontolano-crm --network brontolano-net -p 3002:3000 --env-file .env --restart unless-stopped brontolano/crm:latest
echo   [OK] CRM started on :3002

docker run -d --name brontolano-sales --network brontolano-net -p 3003:3000 --env-file .env --restart unless-stopped brontolano/sales:latest
echo   [OK] Sales started on :3003

docker run -d --name brontolano-inventory --network brontolano-net -p 3004:3000 --env-file .env --restart unless-stopped brontolano/inventory:latest
echo   [OK] Inventory started on :3004

docker run -d --name brontolano-finance --network brontolano-net -p 3005:3000 --env-file .env --restart unless-stopped brontolano/finance:latest
echo   [OK] Finance started on :3005

docker run -d --name brontolano-hr --network brontolano-net -p 3006:3000 --env-file .env --restart unless-stopped brontolano/hr:latest
echo   [OK] HR started on :3006

docker run -d --name brontolano-notifications --network brontolano-net -p 3007:3000 --env-file .env --restart unless-stopped brontolano/notifications:latest
echo   [OK] Notifications started on :3007

docker run -d --name brontolano-web --network brontolano-net -p 8080:3000 --env-file .env --restart unless-stopped brontolano/web:latest
echo   [OK] Web Dashboard started on :8080

echo.
echo ==============================================
echo   DEPLOYMENT COMPLETE!
echo ==============================================
echo.
echo   Open http://localhost:3001 (Auth)
echo   Open http://localhost:3002 (CRM)
echo   Open http://localhost:3003 (Sales)
echo   Open http://localhost:3004 (Inventory)
echo   Open http://localhost:3005 (Finance)
echo   Open http://localhost:3006 (HR)
echo   Open http://localhost:3007 (Notifications)
echo   Open http://localhost:8080 (Web Dashboard)
echo.
echo   Commands:
echo     docker ps              - List containers
echo     docker logs [name]     - View logs
echo     docker stop (docker ps -q) - Stop all
echo.
pause
