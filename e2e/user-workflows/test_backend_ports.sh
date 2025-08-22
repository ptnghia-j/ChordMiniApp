#!/bin/bash

echo "🔍 Testing Python Backend Port Connectivity"
echo "=========================================="

# Test port 5000 (should show AirTunes)
echo ""
echo "📡 Testing port 5000 (should show Apple AirTunes):"
curl -s -I http://localhost:5000/health 2>/dev/null | head -5 || echo "❌ Port 5000 not accessible"

# Test port 5001 (should show our Python backend)
echo ""
echo "📡 Testing port 5001 (should show our Python Flask backend):"
curl -s -I http://localhost:5001/health 2>/dev/null | head -5 || echo "❌ Port 5001 not accessible"

# Test port 8000 (alternative)
echo ""
echo "📡 Testing port 8000 (alternative port):"
curl -s -I http://localhost:8000/health 2>/dev/null | head -5 || echo "❌ Port 8000 not accessible"

echo ""
echo "🔍 Checking what's running on these ports:"
echo "Port 5000:"
lsof -i :5000 2>/dev/null || echo "Nothing running on port 5000"

echo ""
echo "Port 5001:"
lsof -i :5001 2>/dev/null || echo "Nothing running on port 5001"

echo ""
echo "Port 8000:"
lsof -i :8000 2>/dev/null || echo "Nothing running on port 8000"

echo ""
echo "💡 To start Python backend on port 5001 (default):"
echo "cd python_backend && python app.py"
echo ""
echo "💡 To start Python backend on port 8000 (alternative):"
echo "cd python_backend && PORT=8000 python app.py"
echo ""
echo "💡 Migration verification:"
echo "curl http://localhost:3000/api/verify-port-migration"
