import { Request, Response } from 'express';
import { parseModelString } from '../utils/proxyUtils';

export const proxyChatCompletions = async (req: Request, res: Response) => {
  const { model, calliopeProperties } = req.body;

  if (!model) {
    return res.status(400).json({ error: 'Missing required parameter: model' });
  }

  const parsedModel = parseModelString(model as string);

  if (!parsedModel.isValid) {
    return res.status(400).json({
      error: 'Invalid model string format.',
      details: parsedModel.error,
      receivedModelString: model
    });
  }

  // TODO: Implement actual proxying logic here based on calliopeProperties and parsedModel

  return res.status(501).json({
    message: 'Not Implemented: Chat Completions proxy functionality is not yet implemented.',
    requestedModel: model,
    parsedProvider: parsedModel.provider,
    parsedModelName: parsedModel.modelName,
    calliopeProperties,
  });
};

export const proxyCompletions = async (req: Request, res: Response) => {
  const { model, calliopeProperties } = req.body;

  if (!model) {
    return res.status(400).json({ error: 'Missing required parameter: model' });
  }

  const parsedModel = parseModelString(model as string);

  if (!parsedModel.isValid) {
    return res.status(400).json({
      error: 'Invalid model string format.',
      details: parsedModel.error,
      receivedModelString: model
    });
  }

  return res.status(501).json({
    message: 'Not Implemented: Completions proxy functionality is not yet implemented.',
    requestedModel: model,
    parsedProvider: parsedModel.provider,
    parsedModelName: parsedModel.modelName,
    calliopeProperties,
  });
};

export const proxyEmbeddings = async (req: Request, res: Response) => {
  const { model, calliopeProperties } = req.body;

  if (!model) {
    return res.status(400).json({ error: 'Missing required parameter: model' });
  }

  const parsedModel = parseModelString(model as string);

  if (!parsedModel.isValid) {
    return res.status(400).json({
      error: 'Invalid model string format.',
      details: parsedModel.error,
      receivedModelString: model
    });
  }

  return res.status(501).json({
    message: 'Not Implemented: Embeddings proxy functionality is not yet implemented.',
    requestedModel: model,
    parsedProvider: parsedModel.provider,
    parsedModelName: parsedModel.modelName,
    calliopeProperties,
  });
};

export const proxyRerank = async (req: Request, res: Response) => {
  const { model, calliopeProperties } = req.body; // Assuming similar structure for rerank

  if (!model) {
    return res.status(400).json({ error: 'Missing required parameter: model' });
  }

  // Rerank might have different body parameters (e.g., documents, query)
  // For now, sticking to the common pattern for placeholder.
  // const { documents, query, top_n, calliopeProperties } = req.body;


  const parsedModel = parseModelString(model as string);

  if (!parsedModel.isValid) {
    return res.status(400).json({
        error: 'Invalid model string format.',
        details: parsedModel.error,
        receivedModelString: model
    });
  }

  return res.status(501).json({
    message: 'Not Implemented: Rerank proxy functionality is not yet implemented.',
    requestedModel: model,
    parsedProvider: parsedModel.provider,
    parsedModelName: parsedModel.modelName,
    calliopeProperties, // Include other relevant extracted params for rerank if different
  });
};
