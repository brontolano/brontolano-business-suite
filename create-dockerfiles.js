#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function createServiceDockerfile(serviceName, port) {
  const dockerfileContent = `FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache bash curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S brontolano -G nodejs
RUN chown -R brontolano:nodejs /app
USER brontolano

# Expose port
EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\
  CMD wget -q http://localhost:${port}/health || exit 1

# Start application
CMD ["node", "dist/main"]
`;

  const outputDir = path.join(process.cwd(), 'brontolano-business-suite', 'apps', serviceName);
  const dockerfilePath = path.join(outputDir, 'Dockerfile');
  
  fs.writeFileSync(dockerfilePath, dockerfileContent);
  console.log(`📄 Created Dockerfile for ${serviceName} at ${dockerfilePath}`);
}

async function main() {
  const services = [
    { name: 'auth', port: 3001 },
    { name: 'crm', port: 3002 },
    { name: 'sales', port: 3003 },
    { name: 'inventory', port: 3004 },
    { name: 'finance', port: 3005 },
    { name: 'hr', port: 3006 },
    { name: 'notifications', port: 3007 },
    { name: 'web', port: 3000 },
  ];

  console.log('🏗️ Creating Dockerfiles for all services...');
  
  for (const service of services) {
    await createServiceDockerfile(service.name, service.port);
  }
  
  console.log('\n✅ Dockerfiles created successfully!');
  console.log('\n📋 Created Dockerfiles for services:');
  services.forEach(svc => {
    console.log(`   - ${svc.name}: docker/${svc.name}:latest`);
  });
  
  console.log('\n🚀 Next steps:');
  console.log('   1. Create package.json for each service');
  console.log('   2. Add src/ directory with main.ts and basic structure');
  console.log('   3. Run ./build.sh to build and run all services');
}

main().catch(console.error);
