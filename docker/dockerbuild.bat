@echo off
:: Brontolano Business Suite - Windows Build Script
:: =============================================================================

echo.
echo   ╔══════════════════════════════════════════════════════╗
echo   ║       BRONTOLANO BUSINESS SUITE - BUILD              ║
echo   ║       Professional ERP ^& CRM Platform                ║
echo   ╚══════════════════════════════════════════════════════╝
echo.

echo Step 1: Creating directories...
if not exist "shared\migrations" mkdir "shared\migrations"
if not exist "shared\configs" mkdir "shared\configs"
if not exist "shared\scripts" mkdir "shared\scripts"
if not exist "shared\templates" mkdir "shared\templates"
if not exist "monitoring\prometheus" mkdir "monitoring\prometheus"
if not exist "monitoring\grafana\dashboards" mkdir "monitoring\grafana\dashboards"
if not exist "monitoring\elk" mkdir "monitoring\elk"
if not exist "logs" mkdir logs
echo [OK] Directories created

echo.
echo Step 2: Setting up environment...
if not exist ".env" (
    echo [INFO] Creating .env from .env.example...
    copy .env.example .env
    echo [WARN] Please update .env with your configuration!
)

echo.
echo Step 3: Setup complete!
echo.
echo You can now run the project using Docker:
echo   docker compose -f docker/docker-compose.yml up -d
echo.
echo Or start individual services:
echo   cd apps\auth ^&^& npm install ^&^& node src\main.js
echo.
echo ==========================================
echo   BUILD CONFIGURATION COMPLETE
echo ==========================================
echo.
echo Services will be available at:
echo   Web Dashboard:   http://localhost:3000
echo   Auth Service:    http://localhost:3001
echo   CRM Service:     http://localhost:3002
echo   Sales Service:   http://localhost:3003
echo   Inventory:       http://localhost:3004
echo   Finance:         http://localhost:3005
echo   HR:              http://localhost:3006
echo   Notifications:   http://localhost:3007
echo.
echo Login: admin@brontolano.com / admin123
echo.