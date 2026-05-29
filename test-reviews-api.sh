#!/bin/bash
BASE_URL="${SERVER_URL:-http://localhost:1337}"

echo "=========================================="
echo "Testing Strapi Reviews API"
echo "=========================================="
echo ""

echo "1. Testing basic reviews endpoint..."
curl -s "$BASE_URL/api/reviews" | jq '.' 2>/dev/null || curl -s "$BASE_URL/api/reviews"
echo ""
echo ""

echo "2. Testing with pagination..."
curl -s "$BASE_URL/api/reviews?pagination[pageSize]=2" | jq '.' 2>/dev/null || curl -s "$BASE_URL/api/reviews?pagination[pageSize]=2"
echo ""
echo ""

echo "3. Testing with populate (like frontend does)..."
curl -s "$BASE_URL/api/reviews?pagination[page]=1&pagination[pageSize]=2&populate[users_permissions_user][fields][0]=username&populate[users_permissions_user][fields][1]=email&populate[business][populate][0]=category&populate[business][populate][1]=sector" | jq '.' 2>/dev/null || curl -s "$BASE_URL/api/reviews?pagination[page]=1&pagination[pageSize]=2&populate[users_permissions_user][fields][0]=username&populate[users_permissions_user][fields][1]=email&populate[business][populate][0]=category&populate[business][populate][1]=sector"
echo ""
echo ""

echo "4. Checking HTTP status..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$BASE_URL/api/reviews"
echo ""
















