# Fix Strapi v5 Content Manager - checkUserHasPermissions Error
# PowerShell script for Windows

Write-Host "🔧 Fixing Strapi v5 Admin Panel..." -ForegroundColor Cyan

# Stop Strapi if running
Write-Host "📦 Stopping Strapi..." -ForegroundColor Yellow
docker-compose stop strapi 2>$null
if ($LASTEXITCODE -ne 0) {
    npm run stop 2>$null
}

# Clear build cache directories
Write-Host "🧹 Clearing build cache..." -ForegroundColor Yellow
if (Test-Path .cache) { Remove-Item -Recurse -Force .cache }
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
if (Test-Path .strapi) { Remove-Item -Recurse -Force .strapi }
if (Test-Path node_modules\.cache) { Remove-Item -Recurse -Force node_modules\.cache }

# Check if Docker container exists
$containerExists = docker ps -a 2>$null | Select-String "cliavalia-backend"
if ($containerExists) {
    Write-Host "🐳 Clearing Docker container cache..." -ForegroundColor Yellow
    docker-compose exec -T strapi sh -c "rm -rf .cache build dist .strapi node_modules/.cache" 2>$null
}

# Rebuild admin panel
Write-Host "🔨 Rebuilding admin panel..." -ForegroundColor Yellow
if ($containerExists) {
    Write-Host "🐳 Rebuilding in Docker container..." -ForegroundColor Yellow
    docker-compose up -d strapi
    Start-Sleep -Seconds 5
    docker-compose exec -T strapi npm run build 2>$null
    if ($LASTEXITCODE -ne 0) {
        docker-compose exec -T strapi npm run strapi build 2>$null
    }
} else {
    Write-Host "💻 Rebuilding locally..." -ForegroundColor Yellow
    npm run build 2>$null
    if ($LASTEXITCODE -ne 0) {
        npm run strapi build 2>$null
    }
}

Write-Host "✅ Fix complete! Restart Strapi:" -ForegroundColor Green
Write-Host "   Docker: docker-compose up -d strapi" -ForegroundColor White
Write-Host "   Local:  npm run develop" -ForegroundColor White


