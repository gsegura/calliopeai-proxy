# Calliope Proxy Authentication System

This document describes the RSA-based license authentication system for the Calliope Proxy service.

## Overview

The Calliope Proxy uses RSA-signed license tokens for customer authentication. Each customer receives a unique license token that:

- Contains their customer ID and expiration date
- Is cryptographically signed with your private key
- Can only be validated with your public key
- Includes customer-specific API URL configuration

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  License Gen    │    │  Customer       │    │  Proxy Service  │
│  (Private Key)  │    │  (License Token)│    │  (Public Key)   │
│                 │    │                 │    │                 │
│ generate-license├───►│ Bearer Token    ├───►│ Validate &      │
│ sign with RSA   │    │ in Auth Header  │    │ Authenticate    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components

1. **License Service** (`src/services/licenseService.ts`) - Validates RSA signatures
2. **Auth Service** (`src/services/authService.ts`) - Handles authentication logic
3. **Auth Middleware** (`src/middleware/auth.ts`) - Express middleware for routes
4. **Security Middleware** (`src/middleware/security.ts`) - Additional security checks

## Quick Setup

### 1. Generate RSA Key Pair

```bash
# Run the setup script (recommended)
./setup-auth.sh

# Or manually:
cd keys
node generate-keypair.js
```

This creates:
- `keys/calliope-public.pem` - For license validation (deploy with proxy)
- `keys/calliope-private.pem` - For license generation (keep secure!)

### 2. Configure Environment

The setup script automatically updates your `.env` file, or you can manually add:

```bash
# Public key (safe to deploy with proxy)
CALLIOPE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"

# Private key (ONLY for license generation - DO NOT deploy)
CALLIOPE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"
```

### 3. Generate Customer Licenses

```bash
cd keys

# Generate a license for a customer
node generate-license.js \
  --customer-id=acme-corp \
  --expires=2025-12-31 \
  --api-url=https://acme.calliope.ai

# This creates customer-licenses/acme-corp-YYYY-MM-DD/ with:
# - license-key.txt (customer's Bearer token)
# - environment.env (deployment template)
# - metadata.json (license details)
```

### 4. Deploy Customer Proxy

Each customer gets their own proxy instance with their license token:

```yaml
# docker-compose.yml for customer
services:
  calliope-proxy:
    image: calliope-proxy:latest
    environment:
      - CALLIOPE_PUBLIC_KEY=${CALLIOPE_PUBLIC_KEY}
      # Customer provides this as Bearer token
      - CUSTOMER_LICENSE_TOKEN=eyJkYXRhIjoi...
    volumes:
      - ./customer-config.yaml:/app/config.yaml
```

## Usage

### Client Authentication

Customers authenticate using Bearer tokens in the Authorization header:

```bash
curl -X POST \
  -H "Authorization: Bearer eyJkYXRhIjoi..." \
  -H "Content-Type: application/json" \
  https://customer.calliope.ai/model-proxy/v1/chat/completions \
  -d '{"model": "gpt-4", "messages": [...]}'
```

### License Validation

```bash
# Test a license token
cd keys
node validate-license.js --license-key=eyJkYXRhIjoi...

# Check proxy health with authentication
curl -H "Authorization: Bearer eyJkYXRhIjoi..." \
  https://customer.calliope.ai/auth/health
```

## Security Features

### License Security
- **RSA Signature Verification** - Prevents license tampering
- **Expiration Checking** - Automatic license expiration
- **Customer Isolation** - Each customer has separate proxy instance

### Middleware Stack
- **Bearer Token Authentication** - Validates license signatures
- **License Expiration Warnings** - Headers when license expires soon
- **Request Logging** - Security audit trail
- **Request Size Limits** - Basic DoS protection

### Key Management
- **Environment Variables** - Keys loaded from secure environment
- **Separate Generation** - Private key only used for license generation
- **Public Key Deployment** - Only public key deployed with proxy

## API Endpoints

### Authentication Endpoints

```bash
# Health check (validates license)
GET /auth/health
Authorization: Bearer <license-token>

# License information
GET /auth/license-info
Authorization: Bearer <license-token>

# Validate token (public endpoint for testing)
POST /auth/validate-token
Content-Type: application/json
{"token": "license-token"}
```

### Protected Endpoints

All proxy endpoints require valid license authentication:

```bash
# Model proxy endpoints
POST /model-proxy/v1/chat/completions
POST /model-proxy/v1/completions
POST /model-proxy/v1/embeddings
POST /model-proxy/v1/rerank

# IDE platform endpoints
GET /ide/list-assistants
POST /ide/sync-secrets
GET /ide/list-organizations

# Search and crawl endpoints
POST /api/web
POST /api/crawl
```

## Customer Deployment

### Single-Tenant Architecture

Each customer gets their own proxy instance:

```
Customer A ──► Proxy Instance A (License A) ──► LLM APIs
Customer B ──► Proxy Instance B (License B) ──► LLM APIs  
Customer C ──► Proxy Instance C (License C) ──► LLM APIs
```

### Benefits
- **Complete Isolation** - No data leakage between customers
- **Custom Configuration** - Each customer can have unique settings
- **Independent Scaling** - Scale each customer independently
- **Simplified ACL** - No complex multi-tenant access control

### Deployment Steps

1. **Generate Customer License**
   ```bash
   cd keys
   node generate-license.js --customer-id=customer-123 --expires=2025-12-31
   ```

2. **Deploy Customer Proxy**
   ```bash
   # Use customer-deployment-template.yml
   docker-compose -f customer-deployment.yml up -d
   ```

3. **Provide License to Customer**
   - Send license token securely
   - Provide API endpoint URL
   - Include integration documentation

## Monitoring and Maintenance

### License Monitoring
- **Expiration Warnings** - Automatic alerts for expiring licenses
- **Usage Logging** - Track customer API usage
- **Health Checks** - Monitor license validation

### Maintenance Tasks
- **License Renewal** - Generate new licenses before expiration
- **Key Rotation** - Periodically rotate RSA keys
- **Security Audits** - Review authentication logs

## Troubleshooting

### Common Issues

1. **"Invalid license signature"**
   - Check CALLIOPE_PUBLIC_KEY environment variable
   - Verify license was generated with matching private key

2. **"License has expired"**
   - Generate new license with extended expiration
   - Check system clock synchronization

3. **"Missing Authorization header"**
   - Ensure client sends Bearer token
   - Check token format: `Authorization: Bearer <token>`

### Debug Commands

```bash
# Validate environment setup
./setup-auth.sh

# Test license generation and validation
cd keys
node generate-license.js --customer-id=test --expires=2025-12-31
node validate-license.js --license-key=<generated-token>

# Check proxy authentication
curl -H "Authorization: Bearer <token>" http://localhost:3002/auth/health
```

## Security Best Practices

### Key Management
- **Never commit private keys** to version control
- **Use environment variables** for key storage
- **Separate license generation** from proxy deployment
- **Rotate keys periodically** (annually recommended)

### License Distribution
- **Secure channels only** for license distribution
- **Time-limited licenses** (annual renewal recommended)
- **Monitor license usage** for anomalies

### Deployment Security
- **Run as non-root user** in containers
- **Use resource limits** to prevent abuse
- **Enable health checks** for monitoring
- **Use HTTPS only** for production

## Migration Guide

If migrating from a previous authentication system:

1. **Generate new RSA keys** (don't reuse old keys)
2. **Update all customers** with new license tokens
3. **Deploy updated proxy services** with new authentication
4. **Monitor transition** and provide customer support

## Support

For authentication system issues:

1. **Check license validity** with validation script
2. **Verify environment configuration** 
3. **Review proxy logs** for authentication errors
4. **Contact support** for license regeneration if needed
