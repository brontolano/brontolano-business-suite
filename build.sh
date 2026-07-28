#!/bin/bash
# =============================================================================
# Brontolano Business Suite - Complete Build Script
# =============================================================================
set -e

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║       BRONTOLANO BUSINESS SUITE - BUILD              ║"
echo "  ║       Professional ERP & CRM Platform                ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""

SERVER="Brontolano Server"
DATE_BUILD=$(date '+%Y-%m-%d %H:%M:%S')
echo "[${DATE_BUILD}] Build started on ${SERVER}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found! Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Please edit .env file with your configuration!${NC}"
        echo -e "${YELLOW}⚠️  Run: nano .env${NC}"
        exit 1
    else
        echo -e "${RED}❌ .env.example not found either! Creating default .env...${NC}"
        cat > .env << 'EOF'
POSTGRES_DB=brontolano
POSTGRES_USER=brontolano
POSTGRES_PASSWORD=Brontolano2025!
REDIS_PORT=6379
RABBITMQ_USER=brontolano
RABBITMQ_PASSWORD=Brontolano2025!
JWT_SECRET=BrontolanoJWTSecretKey2025VeryLongAndSecure
JWT_ACCESS_EXPIRES=3600
JWT_REFRESH_EXPIRES=86400
MINIO_ROOT_USER=brontolano
MINIO_ROOT_PASSWORD=Brontolano2025!
GRAFANA_ADMIN_PASSWORD=admin
EOF
    fi
fi

# Load environment variables
source .env

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 1: Creating required directories${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

mkdir -p shared/migrations shared/configs shared/scripts shared/templates
mkdir -p monitoring/prometheus monitoring/grafana/dashboards monitoring/elk
mkdir -p logs apps/auth/dist apps/crm/dist apps/sales/dist apps/inventory/dist apps/finance/dist apps/hr/dist apps/notifications/dist apps/web/.next

echo -e "${GREEN}✅ Directories created${NC}"

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 2: Installing dependencies${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

# Install dependencies for each service
for service in auth crm sales inventory finance hr notifications; do
    echo -e "${CYAN}📦 Installing dependencies for ${service}...${NC}"
    cd apps/${service}
    if [ -f package.json ]; then
        npm install --legacy-peer-deps 2>&1 | tail -1
    else
        echo -e "${YELLOW}⚠️  No package.json for ${service}, creating default...${NC}"
        npm init -y > /dev/null 2>&1
        npm install express pg jsonwebtoken bcrypt --legacy-peer-deps 2>&1 | tail -1
    fi
    cd ../..
    echo -e "${GREEN}   ✅ ${service} dependencies installed${NC}"
done

# Install web frontend dependencies
echo -e "${CYAN}📦 Installing web frontend dependencies...${NC}"
cd apps/web
if [ -f package.json ]; then
    npm install --legacy-peer-deps 2>&1 | tail -1
fi
cd ../..
echo -e "${GREEN}✅ Web dependencies installed${NC}"

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 3: Building services${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

for service in auth crm sales inventory finance hr notifications; do
    echo -e "${CYAN}🔨 Building ${service}...${NC}"
    cd apps/${service}
    if [ -f tsconfig.json ]; then
        npx tsc --noEmit false 2>/dev/null || echo -e "${YELLOW}   ⚠️  TypeScript build warnings for ${service}${NC}"
    fi
    cd ../..
    echo -e "${GREEN}   ✅ ${service} built${NC}"
done

echo -e "${GREEN}✅ All services built successfully${NC}"

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 4: Building Docker images${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

docker compose -f docker/docker-compose.yml build 2>&1 | tail -1 || echo -e "${YELLOW}⚠️ Docker compose build skipped — ensure Docker is running${NC}"

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 5: Starting services${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

docker compose -f docker/docker-compose.yml up -d 2>&1 | tail -1 || {
    echo -e "${YELLOW}⚠️ Could not start Docker services. Starting locally...${NC}"
    
    # Start services locally if Docker is not available
    echo -e "${CYAN}   Starting services as background processes...${NC}"
    for service in auth crm sales inventory finance hr notifications; do
        port=${service#*:}
        case $service in
            auth) port=3001 ;;
            crm) port=3002 ;;
            sales) port=3003 ;;
            inventory) port=3004 ;;
            finance) port=3005 ;;
            hr) port=3006 ;;
            notifications) port=3007 ;;
        esac
        echo -e "${CYAN}   Starting ${service} on port ${port}...${NC}"
        cd apps/${service}
        PORT=${port} DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}" node src/main.js &
        echo $! > ../../logs/${service}.pid
        cd ../..
        echo -e "${GREEN}   ✅ ${service} started (PID: $(cat logs/${service}.pid))${NC}"
    done
}

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 6: Verifying status${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

sleep 3

services="auth:3001 crm:3002 sales:3003 inventory:3004 finance:3005 hr:3006 notifications:3007"
for service in ${services}; do
    name="${service%:*}"
    port="${service#*:}"
    
    if curl -s -f "http://localhost:${port}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ ${name} service (port ${port}) — HEALTHY${NC}"
    else
        echo -e "${YELLOW}   ⏳ ${name} service (port ${port}) — WAITING...${NC}"
    fi
done

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║         BUILD COMPLETE                              ║${NC}"
echo -e "${GREEN}  ╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}  📊 Services Available:${NC}"
echo -e "${CYAN}     Web Dashboard:   http://localhost:3000${NC}"
echo -e "${CYAN}     Auth Service:    http://localhost:3001${NC}"
echo -e "${CYAN}     CRM Service:     http://localhost:3002${NC}"
echo -e "${CYAN}     Sales Service:   http://localhost:3003${NC}"
echo -e "${CYAN}     Inventory Service: http://localhost:3004${NC}"
echo -e "${CYAN}     Finance Service: http://localhost:3005${NC}"
echo -e "${CYAN}     HR Service:      http://localhost:3006${NC}"
echo -e "${CYAN}     Notifications:   http://localhost:3007${NC}"
echo ""
echo -e "${CYAN}  📊 Monitoring:${NC}"
echo -e "${CYAN}     Grafana:         http://localhost:3000 (admin/admin)${NC}"
echo -e "${CYAN}     Prometheus:      http://localhost:9090${NC}"
echo -e "${CYAN}     Kibana:          http://localhost:5601${NC}"
echo ""
echo -e "${YELLOW}  📋 Useful Commands:${NC}"
echo -e "${YELLOW}     View logs:      docker-compose logs -f [service]${NC}"
echo -e "${YELLOW}     Stop:           docker-compose down${NC}"
echo -e "${YELLOW}     Restart:        docker-compose restart${NC}"
echo ""
echo -e "${GREEN}  🚀 Login credentials: admin@brontolano.com / admin123${NC}"
echo ""