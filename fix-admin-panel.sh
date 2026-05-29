#!/bin/bash

# Fix Strapi v5 Content Manager - checkUserHasPermissions Error
# This script clears the admin panel cache and rebuilds it

echo "🔧 Fixing Strapi v5 Admin Panel..."

# Stop Strapi if running
echo "📦 Stopping Strapi..."
docker-compose stop strapi 2>/dev/null || npm run stop 2>/dev/null || true

# Clear build cache directories
echo "🧹 Clearing build cache..."
rm -rf .cache
rm -rf build
rm -rf dist
rm -rf .strapi
rm -rf node_modules/.cache

# If running in Docker, clear cache inside container
if docker ps -a | grep -q cliavalia-backend; then
    echo "🐳 Clearing Docker container cache..."
    docker-compose exec -T strapi sh -c "rm -rf .cache build dist .strapi node_modules/.cache" 2>/dev/null || true
fi

# Rebuild admin panel
echo "🔨 Rebuilding admin panel..."
if docker ps -a | grep -q cliavalia-backend; then
    echo "🐳 Rebuilding in Docker container..."
    docker-compose up -d strapi
    sleep 5
    docker-compose exec -T strapi npm run build 2>/dev/null || docker-compose exec -T strapi npm run strapi build 2>/dev/null || true
else
    echo "💻 Rebuilding locally..."
    npm run build 2>/dev/null || npm run strapi build 2>/dev/null || true
fi

echo "✅ Fix complete! Restart Strapi:"
echo "   Docker: docker-compose up -d strapi"
echo "   Local:  npm run develop"


