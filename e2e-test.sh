#!/bin/bash

# End-to-End Test Script for Calliope Proxy API

# This script requires the following environment variables to be set:
# - CALLIOPE_API_KEY: API key for /web and /crawl endpoints
# - PROXY_ACCESS_TOKEN: Bearer token for /model-proxy/* endpoints
# - OLLAMA_API_BASE: Base URL for Ollama (e.g., http://localhost:11434/v1)
# - GEMINI_API_BASE: Base URL for Google Gemini API (e.g., https://generativelanguage.googleapis.com/v1beta)
# - GEMINI_API_KEY: API key for Google Gemini

# Ensure jq is installed for JSON parsing: sudo apt-get install jq (or equivalent)

echo "Starting Calliope Proxy API E2E Tests..."
echo "=============================================="
echo ""

# Base URL for the proxy (assuming it's running locally on port 3000)
PROXY_BASE_URL="http://localhost:3000"

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

# Function to generate headers for /web and /crawl endpoints
get_calliope_headers() {
  local timestamp=$(date +%s) # Seconds since epoch
  # These headers are based on the calliope_proxy.md documentation
  # For testing, some values are hardcoded.
  echo "key: ${CALLIOPE_API_KEY}"
  echo "timestamp: ${timestamp}"
  echo "v: 1"
  echo "extensionVersion: 0.1.0-test" # Test version
  echo "os: Linux" # Test OS
  echo "uniqueId: test-user-123" # Test user ID
}

# Placeholder for future test functions
echo "Script created. Test functions will be added in subsequent steps."

test_web_search() {
  echo "Testing /web endpoint (Web Search)..."

  local query_payload='{"query": "calliope ai coder", "n": 2}'

  # Get headers
  # Note: IFS manipulation is a robust way to read lines into an array or pass to curl
  local header_args=()
  while IFS= read -r header_line; do
    header_args+=(-H "${header_line}")
  done < <(get_calliope_headers)

  # Make request
  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${header_args[@]}" \
    -H "Content-Type: application/json" \
    --data "${query_payload}" \
    "${PROXY_BASE_URL}/web")

  # Extract body and status code
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body: ${body}"
  echo "HTTP Code: ${http_code}"

  # Validate
  if [ "${http_code}" -eq 200 ]; then
    # Check if results is an array of length n using jq
    # And if the first element has a 'title' and 'url'
    jq_check=$(echo "${body}" | jq '.results | (length == 2) and (.[0] | has("title") and has("url"))')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct structure and item count."
      # check_success will use $? which should be 0 if jq_check was true
      true # Sets $? to 0
    else
      echo "Validation: Incorrect structure or item count. JQ check: ${jq_check}"
      false # Sets $? to 1
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    false # Sets $? to 1
  fi
  check_success
}

test_crawl_website() {
  echo "Testing /crawl endpoint (Website Crawler)..."

  # Using a known, simple, and reliable URL for testing.
  # Small depth and limit to make the test quick.
  local crawl_payload='{"startUrl": "https://www.iana.org/domains/reserved", "maxDepth": 0, "limit": 1}'
  # maxDepth 0 usually means only the startUrl itself.

  local header_args=()
  while IFS= read -r header_line; do
    header_args+=(-H "${header_line}")
  done < <(get_calliope_headers)

  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${header_args[@]}" \
    -H "Content-Type: application/json" \
    --data "${crawl_payload}" \
    "${PROXY_BASE_URL}/crawl")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "Response Body (first 500 chars): $(echo $body | cut -c1-500)"
  echo "HTTP Code: ${http_code}"

  if [ "${http_code}" -eq 200 ]; then
    # Check if 'data' array exists, is not empty, has resultsCount, and first item has 'url' and 'content'
    jq_check=$(echo "${body}" | jq 'has("resultsCount") and (.data | length > 0) and (.data[0] | has("url") and has("content"))')
    if [ "${jq_check}" == "true" ]; then
      echo "Validation: Correct structure and data presence."
      true
    else
      echo "Validation: Incorrect structure or missing data. JQ check: ${jq_check}"
      echo "Body was: ${body}" # Print full body on JQ fail for diagnostics
      false
    fi
  else
    echo "Validation: Expected HTTP 200, got ${http_code}"
    echo "Body was: ${body}" # Print full body on HTTP fail for diagnostics
    false
  fi
  check_success
}

test_chat_completions_ollama() {
  echo "Testing /model-proxy/v1/chat/completions (Ollama)..."

  if [ -z "${OLLAMA_API_BASE}" ]; then
    echo "SKIPPING: OLLAMA_API_BASE not set."
    # Consider this a pass for skipping, so $? is 0
    true
    check_success
    return
  fi
  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true
    check_success
    return
  fi

  # User should ensure 'llama2' or their desired model is available in Ollama.
  # The model string "jules-test/ollama-pkg/ollama/llama2" is an example.
  # The proxy parses "{ownerSlug}/{packageSlug}/{provider}/{model}"
  local ollama_payload=$(cat <<EOF
{
  "model": "jules-test/ollama-pkg/ollama/llama2",
  "messages": [
    {"role": "user", "content": "Why is the sky blue?"}
  ],
  "max_tokens": 50,
  "temperature": 0.7,
  "calliopeProperties": {
    "apiBase": "${OLLAMA_API_BASE}",
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
    false
  fi
  check_success
}

test_chat_completions_gemini() {
  echo "Testing /model-proxy/v1/chat/completions (Google Gemini)..."

  if [ -z "${GEMINI_API_BASE}" ]; then
    echo "SKIPPING: GEMINI_API_BASE not set."
    true # Consider skip as pass
    check_success
    return
  fi
  if [ -z "${GEMINI_API_KEY}" ]; then
    echo "SKIPPING: GEMINI_API_KEY not set."
    true # Consider skip as pass
    check_success
    return
  fi
  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true # Consider skip as pass
    check_success
    return
  fi

  # The model string "jules-test/gemini-pkg/google/gemini-pro" is an example.
  # User needs to ensure this model is valid for their Gemini setup.
  local gemini_payload=$(cat <<EOF
{
  "model": "jules-test/gemini-pkg/google/gemini-pro",
  "messages": [
    {"role": "user", "content": "What are the main features of Google Gemini?"}
  ],
  "max_tokens": 100,
  "temperature": 0.7,
  "calliopeProperties": {
    "apiBase": "${GEMINI_API_BASE}",
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
    false
  fi
  check_success
}

test_embeddings_ollama() {
  echo "Testing /model-proxy/v1/embeddings (Ollama)..."

  if [ -z "${OLLAMA_API_BASE}" ]; then
    echo "SKIPPING: OLLAMA_API_BASE not set."
    true # Consider skip as pass
    check_success
    return
  fi
  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true # Consider skip as pass
    check_success
    return
  fi

  # User should ensure 'nomic-embed-text' or their desired embedding model is available in Ollama.
  # Model string "jules-test/ollama-embed/ollama/nomic-embed-text" is an example.
  local ollama_payload=$(cat <<EOF
{
  "model": "jules-test/ollama-embed/ollama/nomic-embed-text",
  "input": "This is a test sentence for generating embeddings.",
  "calliopeProperties": {
    "apiBase": "${OLLAMA_API_BASE}",
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
    false
  fi
  check_success
}

test_embeddings_gemini() {
  echo "Testing /model-proxy/v1/embeddings (Google Gemini)..."

  if [ -z "${GEMINI_API_BASE}" ]; then
    echo "SKIPPING: GEMINI_API_BASE not set."
    true # Consider skip as pass
    check_success
    return
  fi
  if [ -z "${GEMINI_API_KEY}" ]; then
    echo "SKIPPING: GEMINI_API_KEY not set."
    true # Consider skip as pass
    check_success
    return
  fi
  if [ -z "${PROXY_ACCESS_TOKEN}" ]; then
    echo "SKIPPING: PROXY_ACCESS_TOKEN not set."
    true # Consider skip as pass
    check_success
    return
  fi

  # User should ensure 'embedding-001' or their desired model is valid for Gemini.
  # The model string "jules-test/gemini-embed/google/embedding-001" is an example.
  # Gemini actual model might be "models/embedding-001" or "text-embedding-004" etc.
  local gemini_payload=$(cat <<EOF
{
  "model": "jules-test/gemini-embed/google/embedding-001",
  "input": "This is a test sentence for generating Gemini embeddings.",
  "calliopeProperties": {
    "apiBase": "${GEMINI_API_BASE}",
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
