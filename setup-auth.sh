#!/bin/bash

# Calliope Proxy Setup Script
# This script helps set up the authentication system for the Calliope Proxy

set -e

echo "🔧 Calliope Proxy Authentication Setup"
echo "====================================="

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "keys" ]; then
    echo "❌ Please run this script from the root of the Calliope Proxy repository"
    exit 1
fi

# Step 1: Generate key pair if not exists
echo ""
echo "📝 Step 1: Generating RSA Key Pair"
echo "----------------------------------"

cd keys

if [ -f "calliope-public.pem" ] && [ -f "calliope-private.pem" ]; then
    echo "⚠️  Key pair already exists. Do you want to regenerate? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        rm -f calliope-public.pem calliope-private.pem
        node generate-keypair.js
    else
        echo "✅ Using existing key pair"
    fi
else
    node generate-keypair.js
fi

cd ..

# Step 2: Update .env file
echo ""
echo "🔧 Step 2: Updating Environment Configuration"
echo "--------------------------------------------"

PUBLIC_KEY=$(cat keys/calliope-public.pem | sed 's/$/\\n/' | tr -d '\n' | sed 's/\\n$//')
PRIVATE_KEY=$(cat keys/calliope-private.pem | sed 's/$/\\n/' | tr -d '\n' | sed 's/\\n$//')

# Backup existing .env if it exists
if [ -f ".env" ]; then
    cp .env .env.backup
    echo "📋 Backed up existing .env to .env.backup"
fi

# Update .env file with new keys
if [ -f ".env" ]; then
    # Update existing .env
    if grep -q "CALLIOPE_PUBLIC_KEY=" .env; then
        sed -i "s|CALLIOPE_PUBLIC_KEY=.*|CALLIOPE_PUBLIC_KEY=\"$PUBLIC_KEY\"|" .env
    else
        echo "CALLIOPE_PUBLIC_KEY=\"$PUBLIC_KEY\"" >> .env
    fi
    
    if grep -q "CALLIOPE_PRIVATE_KEY=" .env; then
        sed -i "s|CALLIOPE_PRIVATE_KEY=.*|CALLIOPE_PRIVATE_KEY=\"$PRIVATE_KEY\"|" .env
    else
        echo "CALLIOPE_PRIVATE_KEY=\"$PRIVATE_KEY\"" >> .env
    fi
else
    # Create new .env from template
    cp .env.example .env
    sed -i "s|CALLIOPE_PUBLIC_KEY=.*|CALLIOPE_PUBLIC_KEY=\"$PUBLIC_KEY\"|" .env
    sed -i "s|CALLIOPE_PRIVATE_KEY=.*|CALLIOPE_PRIVATE_KEY=\"$PRIVATE_KEY\"|" .env
fi

echo "✅ Updated .env file with Calliope license keys"

# Step 3: Verify setup
echo ""
echo "🧪 Step 3: Verifying Setup"
echo "-------------------------"

# Test key generation
echo "🔍 Testing license generation..."
TEST_LICENSE=$(cd keys && node generate-license.js --customer-id=test-customer --expires=2025-12-31 --api-url=https://test.calliope.ai 2>/dev/null | grep -E '^[A-Za-z0-9+/=]+$' | head -1 || echo "")

if [ -n "$TEST_LICENSE" ]; then
    echo "✅ License generation works"
    
    # Test validation
    echo "🔍 Testing license validation..."
    if cd keys && echo "$TEST_LICENSE" | node validate-license.js --license-key="$TEST_LICENSE" > /dev/null 2>&1; then
        echo "✅ License validation works"
    else
        echo "❌ License validation failed"
        exit 1
    fi
else
    echo "❌ License generation failed"
    exit 1
fi

# Step 4: Security reminders
echo ""
echo "🔒 Security Reminders"
echo "--------------------"
echo "✅ Setup complete! Here are important security notes:"
echo ""
echo "🔐 PRIVATE KEY SECURITY:"
echo "   - The private key is stored in .env for license generation"
echo "   - NEVER deploy the private key with your proxy service"
echo "   - Consider using a separate environment for license generation"
echo "   - Add .env to .gitignore (should already be there)"
echo ""
echo "🌐 DEPLOYMENT:"
echo "   - Only CALLIOPE_PUBLIC_KEY should be in production"
echo "   - Each customer gets their own proxy instance"
echo "   - Generate customer licenses with: cd keys && node generate-license.js"
echo ""
echo "📋 Next Steps:"
echo "   1. Generate customer licenses: cd keys && node generate-license.js --help"
echo "   2. Build and test: npm run build && npm run dev"
echo "   3. Deploy with Docker: docker-compose up --build"
echo ""
echo "🎉 Calliope Proxy authentication is ready!"
