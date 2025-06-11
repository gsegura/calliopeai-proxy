import { Request, Response, NextFunction } from 'express';
import { parseModelString } from '../utils/proxyUtils';
import { proxyLlmRequest, getApiKey, CalliopeProperties } from '../services/llmProxyService';

// Helper function to process and forward requests
const handleProxyRequest = async (req: Request, res: Response, next: NextFunction, endpointPath: string): Promise<void> => {
  try {
    const { model, calliopeProperties, ...downstreamBody } = req.body as { model: string; calliopeProperties?: CalliopeProperties; [key: string]: any; };

    if (!model) {
      res.status(400).json({ error: 'Missing required parameter: model' });
      return;
    }

    if (!calliopeProperties) {
      res.status(400).json({ error: 'Missing calliopeProperties in request body' });
      return;
    }

    if (!calliopeProperties.apiKeyLocation) {
      res.status(400).json({ error: 'Missing required field: calliopeProperties.apiKeyLocation' });
      return;
    }

    const parsedModel = parseModelString(model);
    if (!parsedModel.isValid) {
      res.status(400).json({
        error: 'Invalid model string format.',
        details: parsedModel.error,
        receivedModelString: model,
      });
      return;
    }

    const apiKey = getApiKey(calliopeProperties.apiKeyLocation);
    if (!apiKey) {
      res.status(400).json({ error: 'Failed to retrieve API key. Check apiKeyLocation and environment variables.' });
      return;
    }

    // Use apiBase if provided, otherwise construct default based on provider
    // According to API spec, apiBase is optional, so we should provide defaults for common providers
    let apiBaseUrl = calliopeProperties.apiBase;
    
    if (!apiBaseUrl) {
      // Provide default apiBase URLs for common providers
      const provider = parsedModel.provider?.toLowerCase();
      switch (provider) {
        case 'openai':
          apiBaseUrl = 'https://api.openai.com/v1';
          break;
        case 'anthropic':
          apiBaseUrl = 'https://api.anthropic.com/v1';
          break;
        case 'cohere':
          apiBaseUrl = 'https://api.cohere.ai/v1';
          break;
        case 'google':
        case 'gemini':
          apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
          break;
        default:
          res.status(400).json({ 
            error: 'apiBase is required for unknown providers. Please specify calliopeProperties.apiBase',
            provider: provider || 'unknown'
          });
          return;
      }
    }

    // Construct the full downstream URL
    // Ensure apiBaseUrl does not end with a '/' and endpointPath does not start with one, or handle accordingly.
    const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    const downstreamUrl = `${base}${path}`;

    // Remove calliopeProperties from the body sent to the downstream service
    // The 'downstreamBody' already has this structure due to destructuring.
    // Replace the original model string with the parsed model name for the downstream API
    const requestBodyForDownstream = {
      ...downstreamBody,
      model: parsedModel.modelName
    };

    const result = await proxyLlmRequest(req, downstreamUrl, apiKey, requestBodyForDownstream);

    // Forward headers from the downstream response
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        // Only set headers if they are not undefined or null
        if (value !== undefined && value !== null) {
          // Axios returns header values as strings or arrays of strings. Express handles arrays.
          res.setHeader(key, value as string | string[]);
        }
      }
    }

    if (req.body.stream && result.data && typeof result.data.pipe === 'function') {
      // If it's a stream, pipe it to the response.
      // Ensure appropriate content-type is set (e.g., 'text/event-stream')
      // The proxyLlmRequest and axios should handle setting the initial content-type from downstream.
      // If not, we might need to set it explicitly here.
      res.status(result.status);
      result.data.pipe(res);
    } else {
      // Otherwise, send the JSON response
      res.status(result.status).json(result.data);
    }
  } catch (error: any) {
    console.error(`Error in model proxy request: ${error.message}`, error);
    next(error); // Forward to global error handler
  }
};

export const proxyChatCompletions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  await handleProxyRequest(req, res, next, '/chat/completions');
};

export const proxyCompletions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  await handleProxyRequest(req, res, next, '/completions');
};

export const proxyEmbeddings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  await handleProxyRequest(req, res, next, '/embeddings');
};

export const proxyRerank = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Note: Different providers may have different rerank endpoints
  // Cohere uses /rerank, others may vary. The apiBase should point to the correct provider.
  await handleProxyRequest(req, res, next, '/rerank');
};
