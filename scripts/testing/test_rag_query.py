#!/usr/bin/env python3
"""
LLM Ops QuickStart - RAG Query Testing Script
Simple test to showcase that RAG is working with Cognito authentication

SETUP REQUIREMENTS:
1. Install requests: pip install requests
2. Make sure the S3 bucket has documents (sample-document.txt should be uploaded)
3. Cognito User Pool might need a custom domain configured for OAuth2

If authentication fails, you may need to:
- Create a Cognito user for USER_PASSWORD_AUTH flow, OR
- Configure the Cognito domain for OAuth2 client credentials

TO RUN:
python test_rag_query.py
"""

import requests
import json
import time
from datetime import datetime

# Configuration from your deployment
API_GATEWAY_URL = "https://gxj6fwotpe.execute-api.us-east-1.amazonaws.com/prod"
COGNITO_CLIENT_ID = "5hms6f0616uk0fdesqd2kq8svn"
COGNITO_CLIENT_SECRET = "3ueefv7849tl6p9uspinjk9fvmjmdqd4dpo43jomtle5aec570j"

def get_cognito_token():
    """Get access token from Cognito using OAuth2 client credentials flow"""
    print("🔐 Getting Cognito access token...")
    
    # OAuth2 token endpoint for Cognito
    token_url = "https://revstar-sandbox.auth.us-east-1.amazoncognito.com/oauth2/token"
    
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    # Client credentials flow
    import base64
    credentials = base64.b64encode(f"{COGNITO_CLIENT_ID}:{COGNITO_CLIENT_SECRET}".encode()).decode()
    headers["Authorization"] = f"Basic {credentials}"
    
    payload = {
        "grant_type": "client_credentials",
        "scope": "llmopsquickstart-api/read llmopsquickstart-api/write"
    }
    
    try:
        response = requests.post(token_url, headers=headers, data=payload)
        
        if response.status_code == 200:
            result = response.json()
            access_token = result.get("access_token")
            if access_token:
                print("✅ Successfully obtained access token")
                print(f"   🔑 Token type: {result.get('token_type', 'Bearer')}")
                print(f"   ⏰ Expires in: {result.get('expires_in', 'Unknown')} seconds")
                return access_token
            else:
                print("❌ No access token in response")
                return None
        else:
            print(f"❌ Failed to get token: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"💥 Error getting token: {str(e)}")
        return None

def test_rag_query(access_token, question):
    """Test a RAG query with the given access token"""
    print(f"\n🔍 Testing RAG query: '{question}'")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}"
    }
    
    payload = {
        "question": question
    }
    
    query_url = f"{API_GATEWAY_URL}/docs"
    
    try:
        start_time = time.time()
        response = requests.post(query_url, headers=headers, json=payload)
        execution_time = time.time() - start_time
        
        print(f"   ⏱️  Response time: {execution_time:.2f} seconds")
        
        if response.status_code == 200:
            result = response.json()
            
            print(f"✅ Query successful!")
            print(f"   📝 Response: {result.get('response', 'No response')[:200]}...")
            
            if result.get('citation'):
                print(f"   📚 Citation: {result.get('citation')}")
            else:
                print(f"   📚 Citation: None (might be using fallback)")
                
            if result.get('sessionId'):
                print(f"   🔗 Session ID: {result.get('sessionId')}")
                
            return True, result
            
        else:
            print(f"❌ Query failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"💥 Error during query: {str(e)}")
        return False, None

def main():
    """Run RAG system test"""
    print("\n🚀 LLM OPS QUICKSTART - RAG QUERY TESTING")
    print("=" * 60)
    print(f"📅 Test Run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🌐 API Gateway: {API_GATEWAY_URL}")
    print(f"🔒 Using Cognito Authentication")
    
    # Get access token
    access_token = get_cognito_token()
    if not access_token:
        print("\n❌ Cannot proceed without access token")
        return False
    
    # Test queries to showcase RAG
    test_queries = [
        "Who is Gregory Kabakian?",
        "What is Gregory's role at RevStar Consulting?",
        "What are Gregory's areas of expertise?",
        "What does Gregory enjoy outside of work?",
        "What technologies does Gregory work with?"
    ]
    
    print(f"\n📊 Running {len(test_queries)} test queries...")
    
    successful_queries = 0
    results = []
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n📋 Test {i}/{len(test_queries)}")
        success, result = test_rag_query(access_token, query)
        
        if success:
            successful_queries += 1
            results.append({
                'query': query,
                'response': result.get('response'),
                'citation': result.get('citation'),
                'has_citation': bool(result.get('citation'))
            })
        
        # Small delay between requests
        time.sleep(1)
    
    # Results summary
    print("\n" + "=" * 60)
    print("📊 RAG SYSTEM TEST RESULTS")
    print("=" * 60)
    
    print(f"✅ Successful Queries: {successful_queries}/{len(test_queries)}")
    
    citations_found = sum(1 for r in results if r['has_citation'])
    print(f"📚 Queries with Citations: {citations_found}/{successful_queries}")
    
    if successful_queries > 0:
        print(f"\n🎯 RAG FUNCTIONALITY: {'✅ WORKING' if citations_found > 0 else '⚠️ FALLBACK MODE'}")
        
        if citations_found > 0:
            print("💡 RAG is successfully retrieving from knowledge base!")
            print("📄 Documents are being found and cited correctly")
        else:
            print("💡 API is working but using fallback mode")
            print("📄 Knowledge base might be empty or needs ingestion")
            
        print(f"\n📝 Sample Response:")
        print("-" * 40)
        print(f"Q: {results[0]['query']}")
        print(f"A: {results[0]['response'][:300]}...")
        if results[0]['citation']:
            print(f"📚 Source: {results[0]['citation']}")
        print("-" * 40)
        
    if successful_queries == len(test_queries):
        print("\n🎉 ALL TESTS PASSED - RAG system is working!")
    elif successful_queries > len(test_queries) * 0.5:
        print("\n✅ MOSTLY SUCCESSFUL - System working with minor issues")
    else:
        print("\n⚠️ NEEDS ATTENTION - Multiple query failures")
    
    return successful_queries == len(test_queries)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1) 