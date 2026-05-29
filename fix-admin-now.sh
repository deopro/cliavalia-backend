#!/bin/bash
# Quick fix script - Run this when Docker is working
BASE_URL="${SERVER_URL:-http://localhost:1337}"

echo "🔧 Fixing Strapi v5 Admin Panel..."
echo ""

# Check if container exists and is running
if docker ps | grep -q cliavalia-backend; then
    echo "✅ Container is running"
    echo "🧹 Clearing cache inside container..."
    docker-compose exec strapi sh -c "rm -rf .cache build dist .strapi node_modules/.cache" 2>/dev/null
    echo "🔨 Rebuilding admin panel..."
    docker-compose exec strapi npm run build 2>/dev/null || docker-compose exec strapi npm run strapi build 2>/dev/null
    echo "🔄 Restarting container..."
    docker-compose restart strapi
    echo ""
    echo "✅ Done! Wait 30 seconds, then check $BASE_URL/admin"
elif docker ps -a | grep -q cliavalia-backend; then
    echo "⚠️  Container exists but is not running"
    echo "🚀 Starting container..."
    docker-compose up -d strapi
    sleep 10
    echo "🧹 Clearing cache inside container..."
    docker-compose exec strapi sh -c "rm -rf .cache build dist .strapi node_modules/.cache" 2>/dev/null
    echo "🔨 Rebuilding admin panel..."
    docker-compose exec strapi npm run build 2>/dev/null || docker-compose exec strapi npm run strapi build 2>/dev/null
    echo "🔄 Restarting container..."
    docker-compose restart strapi
    echo ""
    echo "✅ Done! Wait 30 seconds, then check $BASE_URL/admin"
else
    echo "❌ Container not found. Please start Docker Desktop and run:"
    echo "   docker-compose up -d strapi"
    echo "   Then run this script again"
fi


