#!/bin/sh
# Start script that ensures dist directory exists before starting Strapi

if [ ! -d "./dist" ]; then
  echo "⚠️  dist directory not found, running build..."
  npm run build
fi

# Start Strapi
exec strapi start
