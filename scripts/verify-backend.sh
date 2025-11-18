#!/bin/bash

# Script to verify backend API connectivity

set -e

echo "🔍 Checking backend deployment status..."

# Check if CDK outputs exist
if [ -f "infra/outputs.json" ]; then
    echo "✅ Found CDK outputs"
    
    # Extract API URL
    API_URL=$(grep -oP '"ApiUrl":\s*"\K[^"]+' infra/outputs.json || echo "")
    
    if [ -n "$API_URL" ]; then
        echo "✅ API URL: $API_URL"
        
        # Test health endpoint
        echo ""
        echo "🏥 Testing health endpoint..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" || echo "000")
        
        if [ "$HTTP_CODE" = "200" ]; then
            echo "✅ Health check passed"
        else
            echo "❌ Health check failed (HTTP $HTTP_CODE)"
        fi
        
        # Test profile endpoint (should require auth)
        echo ""
        echo "🔐 Testing profile endpoint..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/profile" || echo "000")
        
        if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
            echo "✅ Profile endpoint exists (requires auth)"
        elif [ "$HTTP_CODE" = "200" ]; then
            echo "⚠️  Profile endpoint accessible without auth"
        else
            echo "❌ Profile endpoint error (HTTP $HTTP_CODE)"
        fi
        
    else
        echo "❌ API URL not found in outputs"
    fi
else
    echo "❌ Backend not deployed. Run: cd infra && npx cdk deploy"
fi

echo ""
echo "📝 To deploy backend:"
echo "   cd infra"
echo "   npx cdk deploy"
echo ""
echo "📝 After deployment, update react-frontend/.env with the API URL"
