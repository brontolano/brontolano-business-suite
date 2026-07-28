#!/bin/bash
# =============================================================================
# BRONTOLANO BUSINESS SUITE - Production Docker Build
# =============================================================================
# Quick Start:
#   chmod +x dockerbuild.sh
#   ./dockerbuild.sh
# =============================================================================

set -euo pipefail

VERSION="1.0.0"
NAME="brontolano"

echo "=============================================="
echo "  BRONTOLANO BUSINESS SUITE v${VERSION}"
echo "  Docker Build Script"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Step 1: Check Requirements
echo -e "${YELLOW}[1/6]${NC} Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker is not installed!${NC}"
    echo "Please install Docker Desktop from: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}ERROR: Docker daemon is not running!${NC}"
    echo "Please start Docker Desktop first."
    exit 1
fi
echo -e "${GREEN}  ✅ Docker $(docker --version | awk '{print $3}')${NC}"

# Step 2: Show Project Structure
echo ""
echo -e "${YELLOW}[2/6]${NC} Project structure ready:"
echo ""
echo "  ${NAME}-business-suite/"
echo "  ├── docker/"
echo "  │   ├── docker-compose.yml       # Development"
echo "  │   └── docker-compose.prod.yml  # Production"
echo "  ├── apps/"
echo "  │   ├── auth/           # Authentication Service"
echo "  │   ├── crm/            # Customer Management"
echo "  │   ├── sales/          # Sales & Orders"
echo "  │   ├── inventory/      # Stock Management"
echo "  │   ├── finance/        # Accounting"
echo "  │   ├── hr/             # Human Resources"
echo "  │   ├── notifications/  # Notifications"
echo "  │   └── web/           # Web Dashboard"
echo "  ├── .env                # Environment Config"
echo "  └── README.md"
echo ""

# Step 3: Check .env file
echo -e "${YELLOW}[3/6]${NC} Checking environment configuration..."
if [ ! -f .env ]; then
    echo -e "${RED}  WARNING: .env file not found!${NC}"
    echo "  Creating from template..."
    cat > .env << 'EOFDB'
POSTGRES_DB=brontolano
POSTGRES_USER=brontolano
POSTGRES_PASSWORD=Brontolano2025Secure!
JWT_SECRET=BrontolanoJWTSecretKey2025VeryLongAndSecure
REDIS_HOST=redis
REDIS_PORT=6379
NODE_ENV=production
EOFDB
    echo -e "${GREEN}  ✅ .env created${NC}"
else
    echo -e "${GREEN}  ✅ .env exists${NC}"
fi

# Step 4: Build All Images
echo ""
echo -e "${YELLOW}[4/6]${NC} Building Docker images..."
echo ""

SERVICES=("auth" "crm" "sales" "inventory" "finance" "hr" "notifications" "web")

for service in "${SERVICES[@]}"; do
    echo -e "${CYAN}  Building ${service}...${NC}"
    if [ -f "apps/${service}/Dockerfile" ]; then
        docker build -t "${NAME}/${service}:${VERSION}" -t "${NAME}/${service}:latest" \
            -f "apps/${service}/Dockerfile" "apps/${service}" 2>&1 | tail -3
        echo -e "${GREEN}    ✅ ${service} built successfully${NC}"
    else
        echo -e "${RED}    ❌ Dockerfile not found for ${service}${NC}"
    fi
done

echo ""
echo -e "${GREEN}  ✅ All images built${NC}"

# Step 5: Start Infrastructure
echo ""
echo -e "${YELLOW}[5/6]${NC} Starting infrastructure services..."
echo ""

# Pull base images
echo -e "${CYAN}  Pulling PostgreSQL...${NC}"
docker pull postgres:15-alpine 2>&1 | tail -1

echo -e "${CYAN}  Pulling Redis...${NC}"
docker pull redis:7-alpine 2>&1 | tail -1

echo -e "${CYAN}  Creating network...${NC}"
docker network create "${NAME}-net" 2>/dev/null || true

# Start PostgreSQL
echo -e "${CYAN}  Starting PostgreSQL...${NC}"
docker run -d \
    --name "${NAME}-postgres" \
    --network "${NAME}-net" \
    -e POSTGRES_DB=${POSTGRES_DB:-brontolano} \
    -e POSTGRES_USER=${POSTGRES_USER:-brontolano} \
    -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-Brontolano2025Secure!} \
    -p 5432:5432 \
    -v "${NAME}_pgdata:/var/lib/postgresql/data" \
    --restart unless-stopped \
    postgres:15-alpine

# Start Redis
echo -e "${CYAN}  Starting Redis...${NC}"
docker run -d \
    --name "${NAME}-redis" \
    --network "${NAME}-net" \
    -p 6379:6379 \
    -v "${NAME}_redisdata:/data" \
    --restart unless-stopped \
    redis:7-alpine redis-server --appendonly yes

echo -e "${GREEN}  ✅ Infrastructure services started${NC}"

# Step 6: Start Application Services
echo ""
echo -e "${YELLOW}[6/6]${NC} Starting application services..."
echo ""

for service in "${SERVICES[@]}"; do
    echo -e "${CYAN}  Starting ${service}...${NC}"
    port_map=""
    case $service in
        auth) port_map="3001:3000" ;;
        crm) port_map="3002:3000" ;;
        sales) port_map="3003:3000" ;;
        inventory) port_map="3004:3000" ;;
        finance) port_map="3005:3000" ;;
        hr) port_map="3006:3000" ;;
        notifications) port_map="3007:3000" ;;
        web) port_map="8080:3000" ;;
    esac
    
    docker run -d \
        --name "${NAME}-${service}" \
        --network "${NAME}-net" \
        -p ${port_map} \
        --env-file .env \
        -e SERVICE_NAME="${service}" \
        --restart unless-stopped \
        "${NAME}/${service}:latest" 2>&1 | tail -1
    
    echo -e "${GREEN}    ✅ ${service} running on port ${port_map%%:*}${NC}"
done

# Summary
echo ""
echo "=============================================="
echo -e "${GREEN}  ✅ DEPLOYMENT COMPLETE!${NC}"
echo "=============================================="
echo ""
echo "  📊 Services:"
echo "  ┌──────────────┬────────┬──────────────────────────┐"
echo "  │ Service      │ Port   │ URL                      │"
echo "  ├──────────────┼────────┼──────────────────────────┤"
echo "  │ Auth         │ 3001   │ http://localhost:3001     │"
echo "  │ CRM          │ 3002   │ http://localhost:3002     │"
echo "  │ Sales        │ 3003   │ http://localhost:3003     │"
echo "  │ Inventory    │ 3004   │ http://localhost:3004     │"
echo "  │ Finance      │ 3005   │ http://localhost:3005     │"
echo "  │ HR           │ 3006   │ http://localhost:3006     │"
echo "  │ Notifications│ 3007   │ http://localhost:3007     │"
echo "  │ Web Dashboard│ 8080   │ http://localhost:8080     │"
echo "  └──────────────┴────────┴──────────────────────────┘"
echo ""
echo "  🗄️  Infrastructure:"
echo "  ┌──────────────┬────────┬──────────────────────────┐"
echo "  │ PostgreSQL   │ 5432   │ postgresql://localhost:5432│"
echo "  │ Redis        │ 6379   │ redis://localhost:6379    │"
echo "  └──────────────┴────────┴──────────────────────────┘"
echo ""
echo "  📋 Commands:"
echo "  docker ps                    # List running containers"
echo "  docker logs ${NAME}-auth     # View auth logs"
echo "  docker stop \$(docker ps -q) # Stop all containers"
echo "  docker system prune -a      # Clean everything"
echo ""
echo "=============================================="
