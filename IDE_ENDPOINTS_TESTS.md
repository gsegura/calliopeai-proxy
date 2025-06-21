# IDE Endpoints Test Examples

This file contains test examples for the newly implemented Continue.dev IDE endpoints.

## Prerequisites

- Server running on `http://localhost:3002`
- Valid Bearer token (currently accepts any token for demo purposes)
- `config.yaml` file properly configured

## Endpoint Tests

### 1. Health Check
```bash
curl -X GET "http://localhost:3002/ide/health" \
  -H "Authorization: Bearer test-jwt-token"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-06-20T23:48:44.773Z",
  "version": "1.0.0",
  "stats": {
    "users": 2,
    "organizations": 2,
    "assistants": 2
  }
}
```

### 2. Sync Secrets (Secret Resolution)
```bash
curl -X POST "http://localhost:3002/ide/sync-secrets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-jwt-token" \
  -d '{
    "fqsns": [
      {
        "ownerSlug": "demo-user",
        "packageSlug": "default-assistant",
        "secretName": "OPENAI_API_KEY"
      },
      {
        "ownerSlug": "demo-org",
        "packageSlug": "team-assistant",
        "secretName": "ANTHROPIC_API_KEY"
      }
    ],
    "orgScopeId": "demo-org"
  }'
```

**Expected Response:**
```json
[
  {
    "fqsn": {
      "ownerSlug": "demo-user",
      "packageSlug": "default-assistant",
      "secretName": "OPENAI_API_KEY"
    },
    "value": "sk-user-openai-key-replace-with-real-key"
  },
  {
    "fqsn": {
      "ownerSlug": "demo-org",
      "packageSlug": "team-assistant",
      "secretName": "ANTHROPIC_API_KEY"
    },
    "secretLocation": {
      "secretType": "organization",
      "orgSlug": "demo-org",
      "secretName": "ANTHROPIC_API_KEY"
    }
  }
]
```

### 3. List Assistants
```bash
curl -X GET "http://localhost:3002/ide/list-assistants" \
  -H "Authorization: Bearer test-jwt-token"
```

**With Organization Filter:**
```bash
curl -X GET "http://localhost:3002/ide/list-assistants?organizationId=org-001" \
  -H "Authorization: Bearer test-jwt-token"
```

**With Proxy Override:**
```bash
curl -X GET "http://localhost:3002/ide/list-assistants?alwaysUseProxy=true" \
  -H "Authorization: Bearer test-jwt-token"
```

### 4. List Organizations
```bash
curl -X GET "http://localhost:3002/ide/list-organizations" \
  -H "Authorization: Bearer test-jwt-token"
```

**Expected Response:**
```json
{
  "organizations": [
    {
      "id": "org-001",
      "iconUrl": "https://via.placeholder.com/64x64.png?text=DO",
      "name": "Demo Organization",
      "slug": "demo-org"
    }
  ]
}
```

### 5. List Assistant Full Slugs
```bash
curl -X GET "http://localhost:3002/ide/list-assistant-full-slugs" \
  -H "Authorization: Bearer test-jwt-token"
```

**With Organization Filter:**
```bash
curl -X GET "http://localhost:3002/ide/list-assistant-full-slugs?organizationId=org-001" \
  -H "Authorization: Bearer test-jwt-token"
```

**Expected Response:**
```json
{
  "fullSlugs": [
    "demo-user/default-assistant@1.0.0",
    "demo-org/team-assistant@2.1.3"
  ]
}
```

### 6. Free Trial Status
```bash
curl -X GET "http://localhost:3002/ide/free-trial-status" \
  -H "Authorization: Bearer test-jwt-token"
```

**Expected Response:**
```json
{
  "optedInToFreeTrial": true,
  "chatCount": 0,
  "autocompleteCount": 0,
  "chatLimit": 100,
  "autocompleteLimit": 500
}
```

### 7. Update Free Trial Usage (Internal)
```bash
curl -X POST "http://localhost:3002/ide/update-free-trial-usage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-jwt-token" \
  -d '{
    "chatIncrement": 1,
    "autocompleteIncrement": 5
  }'
```

## Secret Resolution Hierarchy Testing

The secret resolution follows this hierarchy based on organization type:

### Solo Organizations
1. Models Add-On → User Secrets → Free Trial

### Teams/Enterprise Organizations  
1. Org Models Add-On → Org Secrets → User Secrets

### Test Cases

**Test user secret resolution:**
```bash
curl -X POST "http://localhost:3002/ide/sync-secrets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-jwt-token" \
  -d '{
    "fqsns": [
      {
        "ownerSlug": "demo-user",
        "packageSlug": "default-assistant", 
        "secretName": "OPENAI_API_KEY"
      }
    ],
    "orgScopeId": null
  }'
```

**Test organization secret resolution:**
```bash
curl -X POST "http://localhost:3002/ide/sync-secrets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-jwt-token" \
  -d '{
    "fqsns": [
      {
        "ownerSlug": "demo-org",
        "packageSlug": "team-assistant",
        "secretName": "TEAM_SHARED_SECRET"
      }
    ],
    "orgScopeId": "demo-org"
  }'
```

## Configuration

The endpoints use the configuration from `config.yaml` which includes:

- **Users**: User accounts with organization memberships
- **Organizations**: Team structures with roles and permissions  
- **Assistants**: AI assistant configurations with models and context
- **Secrets**: API keys organized by scope (user, org, models add-on, free trial)
- **Free Trial Settings**: Usage limits and default opt-in behavior

## Notes

- All endpoints require Bearer token authentication
- User context is currently mocked in the auth middleware
- Secret values are returned directly for user secrets, locations only for org secrets
- Template variables in assistant configs are processed during listing
- Free trial usage is tracked in memory (will reset on server restart)

## Next Steps

1. Implement proper JWT token verification
2. Add persistent storage for free trial usage
3. Add rate limiting and proper error handling
4. Implement secret rotation and audit logging
5. Add comprehensive integration tests
