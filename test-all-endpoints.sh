#!/bin/bash
BASE_URL="${SERVER_URL:-http://localhost:1337}"

echo "=========================================="
echo "Testing All Strapi Endpoints"
echo "=========================================="
echo ""

echo "1. Testing Sectors..."
curl -w "\nHTTP Status: %{http_code}\n" -s "$BASE_URL/api/sectors" | head -20
echo ""
echo ""

echo "2. Testing Categories..."
curl -w "\nHTTP Status: %{http_code}\n" -s "$BASE_URL/api/categories" | head -20
echo ""
echo ""

echo "3. Testing Reviews..."
curl -w "\nHTTP Status: %{http_code}\n" -s "$BASE_URL/api/reviews" | head -20
echo ""
echo ""

echo "4. Testing Businesses..."
curl -w "\nHTTP Status: %{http_code}\n" -s "$BASE_URL/api/businesses" | head -20
echo ""
echo ""

echo "5. Testing Spotlights..."
curl -w "\nHTTP Status: %{http_code}\n" -s "$BASE_URL/api/spotlights" | head -20
echo ""
echo ""

echo "6. Testing with Populate (Sectors + Categories)..."
curl -w "\nHTTP Status: %{http_code}\n" -s "$BASE_URL/api/sectors?populate=categories&pagination[pageSize]=1" | head -30
echo ""
















