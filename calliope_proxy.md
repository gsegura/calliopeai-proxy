# Calliope Proxy Service Documentation

The Calliope Proxy Service acts as a middleware layer between the Calliope AI Coder VSCode extension and various external services, providing functionality such as web search, website crawling, and model API proxying. This document describes each endpoint, its usage, and which components in the application interact with it.

## Authentication

All endpoints require authentication headers which are generated via the `getHeaders()` function:

```typescript
{
  key: "NfZFVegMpdyT3P5UmAggr7T7Hb6PlcbB",
  timestamp: getTimestamp(), // Function that generates a timestamp with some obfuscation
  v: "1",
  extensionVersion: "x.y.z", // Extension version
  os: "Linux/Windows/MacOS",
  uniqueId: "user-unique-id"
}
```

For model proxy endpoints, the requests use Bearer token authentication:

```
Authorization: Bearer <access_token>
```

This token is typically retrieved from the `workOsAccessToken` property of the `ControlPlaneProxyInfo` object or set through the model configuration.

## Endpoints

### 1. `/web` - Web Search

**Description:**  
This endpoint performs web searches based on user queries and returns relevant results from the internet.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body:
  ```json
  {
    "query": "search query text",
    "n": 6  // Number of results to return
  }
  ```

**Response:**
- Status: 200 OK
- Content-Type: `application/json`
- Body:
  ```json
  [
    {
      "title": "Search Result Title",
      "content": "The content of the search result...",
      "url": "https://example.com/result",
      "type": "web"
    },
    ...
  ]
  ```

**Used By:**  
`WebContextProvider` in `core/context/providers/WebContextProvider.ts`

**Use Case:**  
This endpoint is used when a user explicitly requests to search for information on the web, or when the system determines that external information from the internet would be useful for answering a user's query.

### 2. `/crawl` - Website Crawler

**Description:**  
This endpoint crawls websites starting from a specified URL, extracting content from pages within defined depth and request limits.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body:
  ```json
  {
    "startUrl": "https://example.com",
    "maxDepth": 3,
    "limit": 100
  }
  ```

**Response:**
- Status: 200 OK
- Content-Type: `application/json`
- Body:
  ```json
  [
    {
      "url": "https://example.com",
      "path": "/",
      "content": "<!DOCTYPE html>..."
    },
    ...
  ]
  ```

**Used By:**  
`DefaultCrawler` in `core/indexing/docs/crawlers/DefaultCrawler.ts`

**Use Case:**  
This endpoint is used when the system needs to index documentation websites or specific web pages for later retrieval. This is typically part of the document indexing process that allows the assistant to reference external documentation in its responses.

### 3. `/model-proxy/v1/` - Model API Proxy

**Description:**  
This is a generic proxy endpoint that forwards requests to various language model providers like OpenAI, Anthropic, etc. It handles authentication, request formatting, and response processing.

**Architecture:**  
The proxy is used primarily through the `CalliopeProxy` class, which extends the `OpenAI` class. This class is responsible for:

1. Formatting requests in a way that the proxy can understand
2. Adding special `calliopeProperties` to the request body
3. Parsing responses from the proxy
4. Handling authentication and API key management

The model name used with the proxy follows a specific format:
```
{ownerSlug}/{packageSlug}/{provider}/{model}
```

Where:
- `ownerSlug`: The owner of the package
- `packageSlug`: The package identifier
- `provider`: The actual LLM provider (e.g., "openai", "anthropic")
- `model`: The specific model from that provider (e.g., "gpt-4")

**Important Properties:**  
When initialized, the `CalliopeProxy` class keeps track of several key properties:

- `onPremProxyUrl`: Optional URL for a self-hosted proxy server
- `apiKeyLocation`: Location of the API key in the secret store
- `orgScopeId`: Organization identifier for multi-tenant environments
- `configEnv`: Additional configuration parameters specific to the LLM provider

These properties are passed along in the `calliopeProperties` object with each request.

**Key Endpoints:**

1. **Chat Completions**  
   - Path: `/model-proxy/v1/chat/completions`
   - Used for chat-based language models (e.g., GPT-4, Claude)
   - Follows the OpenAI chat completion API format

2. **Completions**  
   - Path: `/model-proxy/v1/completions`
   - Used for traditional completion-based language models
   - Follows the OpenAI completion API format

3. **Embeddings**  
   - Path: `/model-proxy/v1/embeddings`
   - Used to generate vector embeddings of text
   - Follows the OpenAI embeddings API format

4. **Reranking**  
   - Path: `/model-proxy/v1/rerank`
   - Used to rerank documents based on relevance to a query
   - Returns relevance scores for each document

**Request Example (Chat Completions):**
```json
{
  "model": "owner/package/openai/gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello, who are you?"}
  ],
  "max_tokens": 500,
  "temperature": 0.7,
  "calliopeProperties": {
    "apiKeyLocation": "env:OPENAI_API_KEY",
    "apiBase": "https://api.openai.com/v1",
    "orgScopeId": "org-123",
    "env": {
      "additionalConfig": "value"
    }
  }
}
```

**Used By:**  
The proxy is used by all LLM operations in the system when configured to use a model with the provider `calliope-proxy`. This happens:
1. Automatically for models configured with unresolved secrets (via `useProxyForUnrenderedSecrets`)
2. When explicitly configured in the model settings with `provider: "calliope-proxy"`
3. When an on-premise proxy is configured via the `onPremProxyUrl` setting

**Use Case:**  
This endpoint is the core of the system's ability to use various LLM providers through a unified interface while:
1. Securely managing API keys
2. Supporting multi-tenant environments
3. Enabling self-hosted proxy servers
4. Providing consistent metrics and logging

## Implementing Your Own Proxy

To implement your own compatible proxy, you should:

1. Set up HTTP endpoints matching the paths described above
2. Implement the authentication validation using the headers format
3. For the `/web` endpoint, implement a web search capability
4. For the `/crawl` endpoint, implement a website crawler that respects the provided parameters
5. For the `/model-proxy/v1/` endpoints, implement a forwarding system that:
   - Reads the `calliopeProperties` from the request body
   - Uses those properties to determine the actual API endpoint and authentication to use
   - Forwards the request appropriately, removing the `calliopeProperties` from the body
   - Returns the response from the actual AI model provider

### Integration with Existing Code

There are two main approaches to integrate your custom proxy:

#### 1. Global Configuration

Update the centralized proxy configuration we created:

```typescript
// In your application startup code
import { configureProxy } from './core/control-plane/proxy';

configureProxy({
  proxyUrl: 'https://your-custom-proxy.example.com'
});
```

This will affect all components that use the proxy, including web search and crawling.

#### 2. Model-Specific Configuration

For LLM models specifically, you can configure the proxy URL at the model level:

```typescript
// In your model configuration
{
  "provider": "calliope-proxy",
  "model": "your-org/your-package/openai/gpt-4",
  "onPremProxyUrl": "https://your-custom-proxy.example.com"
}
```

This approach allows you to use different proxies for different models or environments.

### Required Model Proxy Endpoints

At minimum, your custom proxy should implement:

1. `/model-proxy/v1/chat/completions` - For chat-based models
2. `/model-proxy/v1/completions` - For completion-based models
3. `/model-proxy/v1/embeddings` - For embedding generation
4. `/model-proxy/v1/rerank` - For document reranking (if used)

Each endpoint should handle the `calliopeProperties` object in the request body, extract the necessary authentication and configuration, and forward the request to the appropriate LLM provider.

### Handling Model Names

The model name sent to your proxy will be in the format:
```
{ownerSlug}/{packageSlug}/{provider}/{model}
```

Your proxy needs to:
1. Parse this format using a function similar to `parseProxyModelName`
2. Extract the actual provider and model
3. Route the request to the correct LLM API

## Security Considerations

The proxy server handles sensitive information including:
- API keys for various services
- User queries and data
- Authentication tokens

Ensure your implementation follows security best practices including:
- TLS encryption for all communications
- Proper authentication and authorization
- Secure handling of API keys and credentials
- Input validation and sanitization
- Rate limiting to prevent abuse
