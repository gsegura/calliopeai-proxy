# Calliope Proxy Service

## Description

This service acts as a proxy layer for various external APIs, including web search, website crawling, and Large Language Model (LLM) providers. It standardizes access to these services, manages authentication, and provides a unified interface for the Calliope project.

## Prerequisites

To run this project, you will need:
- [Node.js](https://nodejs.org/) (v18.x or later recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Environment Variables

Configuration for the application is managed through environment variables.

1.  Create a `.env` file in the root of the project by copying the example file:
    ```bash
    cp .env.example .env
    ```
2.  Edit the `.env` file and provide values for the required variables.

### Required Variables:

*   `SEARCHAPI_API_KEY`: API key for SearchAPI.io, used by the `/api/web` endpoint for web searches.

### Optional Variables:

*   `PORT`: The port on which the server will listen. Defaults to `3000`.

### LLM API Keys for Model Proxy:

The `.env.example` file includes placeholders for common LLM providers (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). When a request is made to the `/model-proxy/v1/...` endpoints, the request body is expected to contain a `calliopeProperties` object. This object includes an `apiKeyLocation` field, which specifies how the proxy should find the necessary API key.

Currently, the proxy supports the `env:VARIABLE_NAME` format for `apiKeyLocation`. For example, if `apiKeyLocation` is `"env:OPENAI_API_KEY"`, the proxy will look for an environment variable named `OPENAI_API_KEY` to use as the Bearer token for the downstream request to the OpenAI API.

You will need to:
1.  Add the actual API keys to your `.env` file for any LLM providers you intend to use.
2.  Ensure that the `VARIABLE_NAME` part of the `apiKeyLocation` value in your requests matches the environment variable name you've set in `.env`.
3.  The `calliopeProperties` should also include `apiBase` which is the base URL for the target LLM provider (e.g., `https://api.openai.com/v1`).

Example for OpenAI:
- In `.env`: `OPENAI_API_KEY=sk-yourActualOpenAiKey...`
- In request to `/model-proxy/v1/chat/completions`:
  ```json
  {
    "model": "owner/pkg/openai/gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}],
    "calliopeProperties": {
      "apiKeyLocation": "env:OPENAI_API_KEY",
      "apiBase": "https://api.openai.com/v1"
    }
  }
  ```
Make sure to set the correct `apiBase` for each provider alongside the API key. For Azure OpenAI, `apiBase` would be your specific Azure resource endpoint. For Ollama, it would be the URL where your Ollama instance is running (e.g., `http://localhost:11434/api`).

## Running the Application

### Development Mode

To run the application in development mode with live reloading (using `ts-node`):
```bash
npm run dev
```
The server will typically be available at `http://localhost:PORT`.

### Production Mode

1.  **Build the TypeScript code:**
    ```bash
    npm run build
    ```
    This command compiles the TypeScript files from `src` into JavaScript files in the `dist` directory.

2.  **Start the server:**
    ```bash
    npm start
    ```
    This command runs the compiled application from the `dist` directory using Node.js.

## API Endpoints

This service provides the following main sets of endpoints. For detailed API specifications, please refer to the `calliope_proxy_oas.yaml` OpenAPI specification file.

*   **`/api/web` (POST)**
    *   Purpose: Proxies requests to a web search provider (currently SearchAPI.io via Langchain).
    *   Authentication: Requires Calliope-specific headers (`key`, `timestamp`, `v`, `extensionversion`, `os`, `uniqueid`).
*   **`/api/crawl` (POST)**
    *   Purpose: Crawls a website based on a starting URL, depth, and limit. Uses `crawlee`.
    *   Authentication: Requires Calliope-specific headers (same as `/api/web`).
*   **`/model-proxy/v1/...`**
    *   This path hosts various endpoints for proxying requests to different LLM providers.
    *   Endpoints include:
        *   `/chat/completions` (POST)
        *   `/completions` (POST)
        *   `/embeddings` (POST)
        *   `/rerank` (POST)
    *   Authentication: Requires a Bearer token in the `Authorization` header.
*   **`/` (GET)**
    *   Purpose: A simple health check endpoint.
    *   Authentication: None.

## Project Structure

A brief overview of the main directories in the project:

*   **`src/`**: Contains all the TypeScript source code.
    *   **`controllers/`**: Handles the business logic for incoming requests.
    *   **`middleware/`**: Contains Express middleware functions (e.g., authentication, error handling).
    *   **`routes/`**: Defines the API routes and maps them to controller functions.
    *   **`services/`**: (Currently less used, but intended for more complex business logic or third-party service integrations if controllers become too large).
    *   **`utils/`**: Utility functions used across the application.
    *   **`index.ts`**: The main entry point for the application, sets up the Express server.
*   **`dist/`**: Contains the compiled JavaScript code (generated by `npm run build`).
*   **`.env.example`**: Example file for environment variables.
*   **`README.md`**: This file.
*   **`package.json`**: Lists project dependencies and npm scripts.
*   **`tsconfig.json`**: Configuration for the TypeScript compiler.

---

This README provides a basic guide to getting the Calliope Proxy Service up and running. Refer to the source code and OpenAPI specification for more detailed information.
