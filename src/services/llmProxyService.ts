import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { Request } from 'express';

interface ProxyRequestBody {
  [key: string]: any;
}

export interface CalliopeProperties {
  apiKeyLocation?: string;
  apiBase?: string;
  orgScopeId?: string;
  env?: { [key: string]: any };
}

/**
 * Retrieves the API key based on the apiKeyLocation.
 * For now, it only supports "env:VAR_NAME" format.
 * @param apiKeyLocation - The location of the API key (e.g., "env:OPENAI_API_KEY").
 * @returns The API key string or null if not found.
 */
export const getApiKey = (apiKeyLocation?: string): string | null => {
  if (!apiKeyLocation) {
    console.error('API key location is not defined.');
    return null;
  }

  if (apiKeyLocation.startsWith('env:')) {
    const envVarName = apiKeyLocation.substring(4);
    const apiKey = process.env[envVarName];
    if (!apiKey) {
      console.error(`API key environment variable "${envVarName}" not found.`);
      return null;
    }
    return apiKey;
  }

  console.error(`Unsupported API key location format: ${apiKeyLocation}`);
  return null;
};

/**
 * Proxies a request to a downstream LLM provider.
 * @param originalRequest The original Express request object.
 * @param downstreamUrl The URL to proxy the request to.
 * @param apiKey The API key for the downstream service.
 * @param requestBody The body to send to the downstream service.
 * @returns The response from the downstream service.
 */
export const proxyLlmRequest = async (
  originalRequest: Request,
  downstreamUrl: string,
  apiKey: string,
  requestBody: ProxyRequestBody
) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // Forward any other headers from the original request that might be relevant,
  // excluding host and content-length as those will be set by axios.
  // Be cautious about which headers are forwarded to avoid leaking sensitive information.
  // For now, we primarily rely on the API key for auth with the downstream service.
  // If specific headers need to be passed through, this can be expanded.

  const config: AxiosRequestConfig = {
    method: originalRequest.method, // Use the original request's method
    url: downstreamUrl,
    headers,
    data: requestBody,
    responseType: requestBody.stream ? 'stream' : 'json',
    // For streaming, we need to handle the response as a stream
    timeout: requestBody.stream ? 0 : 30000, // No timeout for streaming, 30s for regular requests
  };

  try {
    console.log(`Proxying request to: ${config.method} ${downstreamUrl}`);
    const response = await axios(config);
    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(`Error proxying request to ${downstreamUrl}:`, axiosError.message);
      // Log more details if available
      if (axiosError.response) {
        console.error('Downstream error response status:', axiosError.response.status);
        console.error('Downstream error response data:', axiosError.response.data);
      } else if (axiosError.request) {
        console.error('Downstream request made but no response received:', axiosError.request);
      }
      return {
        status: axiosError.response?.status || 500,
        data: axiosError.response?.data || { error: 'Error proxying request', details: axiosError.message },
        headers: axiosError.response?.headers || {},
      };
    }
    // Non-Axios error
    console.error(`Unexpected error proxying request to ${downstreamUrl}:`, error);
    return {
      status: 500,
      data: { error: 'Unexpected error during proxying', details: (error as Error).message },
      headers: {},
    };
  }
};
