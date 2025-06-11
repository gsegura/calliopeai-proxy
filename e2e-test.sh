#!/bin/bash

# End-to-End Test Script for Calliope Proxy API

# This script requires the following environment variables to be set:
# - CALLIOPE_API_KEY: API key for /web and /crawl endpoints
# - PROXY_ACCESS_TOKEN: Bearer token for /model-proxy/* endpoints
# 
# Optional environment variables:
# - OLLAMA_API_BASE: Base URL for Ollama (defaults to http://localhost:11434/v1)
# - OLLAMA_API_KEY: API key for Ollama (usually empty string or not needed)
# - GEMINI_API_BASE: Base URL for Google Gemini API (defaults to https://generativelanguage.googleapis.com/v1beta)
# - GEMINI_API_KEY: API key for Google Gemini
#
# Example usage:
# export CALLIOPE_API_KEY="your-calliope-key"
# export PROXY_ACCESS_TOKEN="your-bearer-token"
# export OLLAMA_API_KEY=""  # Ollama typically doesn't need an API key
# export GEMINI_API_KEY="your-gemini-key"
# ./e2e-test.sh

# Ensure jq is installed for JSON parsing: sudo apt-get install jq (or equivalent)

echo "Starting Calliope Proxy API E2E Tests..."
echo "=============================================="
echo ""

# Base URL for the proxy (assuming it's running locally on port 3000)
PROXY_BASE_URL="http://localhost:3002"

# Function to check if previous command was successful
check_success() {
  if [ $? -eq 0 ]; then
    echo "✅ Test Passed"
  else
    echo "❌ Test Failed"
    # Optionally exit on first failure
    # exit 1
  fi
  echo "----------------------------------------------"
  echo ""
}

# Placeholder for future test functions
echo "Script created. Test functions will be added in subsequent steps."

test_web_search() {
  echo "Testing /web endpoint (Web Search)..."

  if [ -z "${CALLIOPE_API_KEY}" ]; then
    echo "SKIPPING: CALLIOPE_API_KEY not set."
    true
    check_success
    return
  fi

  local query_payload='{"query": "calliope ai coder", "n": 2}'

  # Get headers - need to set them properly as individual -H flags
  local timestamp=$(date +%s)
  
  # Make request with proper headers
  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "key: ${CALLIOPE_API_KEY}" \
    -H "timestamp: ${timestamp}" \
    -H "v: 1" \
    -H "extensionVersion: 0.1.0-test" \
    -H "os: Linux" \
    -H "uniqueId: test-user-123" \
    -H "Content-Type: application/json" \
    --data "${query_payload}" \
    "${PROXY_BASE_URL}/api/web")

  # Extract body and status code
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body: ${body}"
  echo "HTTP Code: ${http_code}"

  # Validate - According to API spec, should return array of ContextItem objects
  if [ "${http_code}" -eq 200 ]; then
    # Check if response is an array and if elements have required ContextItem fields
    jq_check=$(echo "${body}" | jq 'if type == "array" then length > 0 and (.[0] | has("name") and has("description") and has("content")) else false end')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct ContextItem array structure."
      true
    else
      echo "Validation: Incorrect structure. Expected array of ContextItem objects. JQ check: ${jq_check}"
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    false
  fi
  check_success
}

test_crawl_website() {
  echo "Testing /crawl endpoint (Website Crawler)..."

  if [ -z "${CALLIOPE_API_KEY}" ]; then
    echo "SKIPPING: CALLIOPE_API_KEY not set."
    true
    check_success
    return
  fi

  # Using a known, simple, and reliable URL for testing.
  # Small depth and limit to make the test quick.
  local crawl_payload='{"startUrl": "https://www.iana.org/domains/reserved", "maxDepth": 0, "limit": 1}'

  local timestamp=$(date +%s)

  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "key: ${CALLIOPE_API_KEY}" \
    -H "timestamp: ${timestamp}" \
    -H "v: 1" \
    -H "extensionVersion: 0.1.0-test" \
    -H "os: Linux" \
    -H "uniqueId: test-user-123" \
    -H "Content-Type: application/json" \
    --data "${crawl_payload}" \
    "${PROXY_BASE_URL}/api/crawl")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body (first 500 chars): $(echo $body | cut -c1-500)"
  echo "HTTP Code: ${http_code}"

  if [ "${http_code}" -eq 200 ]; then
    # According to API spec, should return array of PageData objects with url, path, content
    jq_check=$(echo "${body}" | jq 'if type == "array" then length > 0 and (.[0] | has("url") and has("path") and has("content")) else false end')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct PageData array structure."
      true
    else
      echo "Validation: Incorrect structure. Expected array of PageData objects. JQ check: ${jq_check}"
      echo "Body was: ${body}"
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    echo "Body was: ${body}"
    false
  fi
  check_success
}

test_chat_completions_ollama() {
  echo "Testing /model-proxy/v1/chat/completions (Ollama)..."

  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true
    check_success
    return
  fi

  # Set default OLLAMA_API_BASE if not provided
  local ollama_base="${OLLAMA_API_BASE:-http://localhost:11434/v1}"
  
  # User should ensure 'llama2' or their desired model is available in Ollama.
  # The model string "jules-test/ollama-pkg/ollama/llama2" is an example.
  # The proxy parses "{ownerSlug}/{packageSlug}/{provider}/{model}"
  local ollama_payload=$(cat <<EOF
{
  "model": "jules-test/ollama-pkg/ollama/qwen3:1.7b",
  "messages": [
    {"role": "user", "content": "Say 'Hello from Ollama' and nothing else."}
  ],
  "max_tokens": 50,
  "temperature": 0.0,
  "calliopeProperties": {
    "apiBase": "${ollama_base}",
    "apiKeyLocation": "env:OLLAMA_API_KEY"
  }
}
EOF
)

  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${PROXY_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${ollama_payload}" \
    "${PROXY_BASE_URL}/model-proxy/v1/chat/completions")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body (first 300 chars): $(echo "$body" | cut -c1-300)..."
  echo "HTTP Code: ${http_code}"

  if [ "${http_code}" -eq 200 ]; then
    jq_check=$(echo "${body}" | jq '(.choices | length > 0) and (.choices[0].message.content | type == "string" and length > 0)')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct structure and non-empty response."
      true
    else
      echo "Validation: Incorrect structure or empty response. JQ check: ${jq_check}"
      echo "Body was: ${body}"
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    echo "Body was: ${body}"
    # Don't fail if Ollama isn't available - just note it
    if [[ "${body}" == *"Failed to retrieve API key"* ]]; then
      echo "Note: This may be expected if OLLAMA_API_KEY is not set or Ollama is not running."
    fi
    false
  fi
  check_success
}

test_chat_completions_gemini() {
  echo "Testing /model-proxy/v1/chat/completions (Google Gemini)..."

  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true
    check_success
    return
  fi

  # Use default if not provided
  local gemini_base="${GEMINI_API_BASE:-https://generativelanguage.googleapis.com/v1beta}"

  # The model string "jules-test/gemini-pkg/google/gemini-pro" is an example.
  # User needs to ensure this model is valid for their Gemini setup.
  local gemini_payload=$(cat <<EOF
{
  "model": "jules-test/gemini-pkg/google/gemini-2.0-flash-exp",
  "messages": [
    {"role": "user", "content": "Say 'Hello from Gemini' and nothing else."}
  ],
  "max_tokens": 50,
  "temperature": 0.0,
  "calliopeProperties": {
    "apiBase": "${gemini_base}",
    "apiKeyLocation": "env:GEMINI_API_KEY"
  }
}
EOF
)

  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${PROXY_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${gemini_payload}" \
    "${PROXY_BASE_URL}/model-proxy/v1/chat/completions")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body (first 300 chars): $(echo "$body" | cut -c1-300)..."
  echo "HTTP Code: ${http_code}"

  # Assuming proxy ensures OpenAI-like response structure
  if [ "${http_code}" -eq 200 ]; then
    jq_check=$(echo "${body}" | jq '(.choices | length > 0) and (.choices[0].message.content | type == "string" and length > 0)')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct structure and non-empty response."
      true
    else
      echo "Validation: Incorrect structure or empty response. JQ check: ${jq_check}"
      echo "Body was: ${body}"
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    echo "Body was: ${body}"
    # Don't fail if API key isn't available - just note it
    if [[ "${body}" == *"Failed to retrieve API key"* ]]; then
      echo "Note: This may be expected if GEMINI_API_KEY is not set."
    fi
    false
  fi
  check_success
}

test_embeddings_ollama() {
  echo "Testing /model-proxy/v1/embeddings (Ollama)..."

  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true
    check_success
    return
  fi

  local ollama_base="${OLLAMA_API_BASE:-http://localhost:11434/v1}"

  # User should ensure 'nomic-embed-text' or their desired embedding model is available in Ollama.
  # Model string "jules-test/ollama-embed/ollama/nomic-embed-text" is an example.
  local ollama_payload=$(cat <<EOF
{
  "model": "jules-test/ollama-embed/ollama/nomic-embed-text",
  "input": "This is a test sentence for generating embeddings.",
  "calliopeProperties": {
    "apiBase": "${ollama_base}",
    "apiKeyLocation": "env:OLLAMA_API_KEY"
  }
}
EOF
)

  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${PROXY_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${ollama_payload}" \
    "${PROXY_BASE_URL}/model-proxy/v1/embeddings")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body (first 300 chars): $(echo "$body" | cut -c1-300)..." # Embeddings can be long
  echo "HTTP Code: ${http_code}"

  if [ "${http_code}" -eq 200 ]; then
    # Check for data array, non-empty, first item has an embedding array of numbers
    # and object type is "embedding"
    jq_check=$(echo "${body}" | jq '(.data | length > 0) and (.data[0].object == "embedding") and (.data[0].embedding | type == "array" and length > 0) and (if .data[0].embedding[0] then .data[0].embedding[0] | type == "number" else false end)')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct structure and embedding format."
      true
    else
      echo "Validation: Incorrect structure or embedding format. JQ check: ${jq_check}"
      echo "Body was: ${body}"
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    echo "Body was: ${body}"
    if [[ "${body}" == *"Failed to retrieve API key"* ]]; then
      echo "Note: This may be expected if OLLAMA_API_KEY is not set or Ollama is not running."
    fi
    false
  fi
  check_success
}

test_embeddings_gemini() {
  echo "Testing /model-proxy/v1/embeddings (Google Gemini)..."

  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true
    check_success
    return
  fi

  local gemini_base="${GEMINI_API_BASE:-https://generativelanguage.googleapis.com/v1beta}"

  # User should ensure 'embedding-001' or their desired model is valid for Gemini.
  # The model string "jules-test/gemini-embed/google/embedding-001" is an example.
  # Gemini actual model might be "models/embedding-001" or "text-embedding-004" etc.
  local gemini_payload=$(cat <<EOF
{
  "model": "jules-test/gemini-embed/google/text-embedding-004",
  "input": "This is a test sentence for generating Gemini embeddings.",
  "calliopeProperties": {
    "apiBase": "${gemini_base}",
    "apiKeyLocation": "env:GEMINI_API_KEY"
  }
}
EOF
)

  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${PROXY_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${gemini_payload}" \
    "${PROXY_BASE_URL}/model-proxy/v1/embeddings")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body (first 300 chars): $(echo "$body" | cut -c1-300)..."
  echo "HTTP Code: ${http_code}"

  if [ "${http_code}" -eq 200 ]; then
    jq_check=$(echo "${body}" | jq '(.data | length > 0) and (.data[0].object == "embedding") and (.data[0].embedding | type == "array" and length > 0) and (if .data[0].embedding[0] then .data[0].embedding[0] | type == "number" else false end)')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct structure and embedding format."
      true
    else
      echo "Validation: Incorrect structure or embedding format. JQ check: ${jq_check}"
      echo "Body was: ${body}"
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    echo "Body was: ${body}"
    if [[ "${body}" == *"Failed to retrieve API key"* ]]; then
      echo "Note: This may be expected if GEMINI_API_KEY is not set."
    fi
    false
  fi
  check_success
}

echo "=============================================="
echo "E2E Tests Finished."

# Call test functions
test_web_search
test_crawl_website
test_chat_completions_ollama
test_chat_completions_gemini
test_embeddings_ollama
test_embeddings_gemini

echo ""
echo "=============================================="
echo "Test Summary Complete"
echo "=============================================="
