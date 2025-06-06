import { Request, Response } from 'express';
import { parseModelString } from '../utils/proxyUtils';
import { proxyLlmRequest, getApiKey, CalliopeProperties } from '../services/llmProxyService';

// Helper function to process and forward requests
const handleProxyRequest = async (req: Request, res: Response, endpointPath: string) => {
  const { model, calliopeProperties, ...downstreamBody } = req.body as { model: string; calliopeProperties?: CalliopeProperties; [key: string]: any; };

  if (!model) {
    return res.status(400).json({ error: 'Missing required parameter: model' });
  }

  if (!calliopeProperties || !calliopeProperties.apiBase) {
    return res.status(400).json({ error: 'Missing calliopeProperties or apiBase in request body' });
  }

  const parsedModel = parseModelString(model);
  if (!parsedModel.isValid) {
    return res.status(400).json({
      error: 'Invalid model string format.',
      details: parsedModel.error,
      receivedModelString: model,
    });
  }

  const apiKey = getApiKey(calliopeProperties.apiKeyLocation);
  if (!apiKey) {
    return res.status(400).json({ error: 'Failed to retrieve API key. Check apiKeyLocation and environment variables.' });
  }

  // Construct the full downstream URL
  // Ensure apiBase does not end with a '/' and endpointPath does not start with one, or handle accordingly.
  const base = calliopeProperties.apiBase.endsWith('/') ? calliopeProperties.apiBase.slice(0, -1) : calliopeProperties.apiBase;
  const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const downstreamUrl = `${base}${path}`;

  // Remove calliopeProperties from the body sent to the downstream service
  // The 'downstreamBody' already has this structure due to destructuring.

  const result = await proxyLlmRequest(req, downstreamUrl, apiKey, downstreamBody);

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
};

export const proxyChatCompletions = async (req: Request, res: Response) => {
  await handleProxyRequest(req, res, '/chat/completions');
};

export const proxyCompletions = async (req: Request, res: Response) => {
  await handleProxyRequest(req, res, '/completions');
};

export const proxyEmbeddings = async (req: Request, res: Response) => {
  await handleProxyRequest(req, res, '/embeddings');
};

export const proxyRerank = async (req: Request, res: Response) => {
  // Note: The OAS spec for rerank has path /model-proxy/v1/rerank.
  // Assuming the calliopeProperties.apiBase would point to the model provider's base URL,
  // and the specific rerank path for that provider needs to be appended.
  // This might vary by provider. For now, let's assume a common path '/rerank' or that
  // the full path is somehow part of apiBase or needs to be constructed differently.
  // For consistency with other OpenAI-like endpoints, using '/rerank'.
  // This might need adjustment based on actual provider API structures for reranking.
  await handleProxyRequest(req, res, '/rerank');
};
