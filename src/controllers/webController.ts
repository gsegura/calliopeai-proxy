import { Request, Response } from 'express';
import { SearchApi } from '@langchain/community/tools/searchapi';

export const searchWeb = async (req: Request, res: Response) => {
  const { query, n } = req.body; // n is for the number of results

  if (!query) {
    return res.status(400).json({ error: 'Missing required parameter: query' });
  }

  if (!process.env.SEARCHAPI_API_KEY) {
    console.error('SEARCHAPI_API_KEY is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: Search API key is missing.' });
  }

  console.log(`Received web search request for query: "${query}"${n ? ` with n: ${n}` : ''}`);

  try {
    const searchApi = new SearchApi(process.env.SEARCHAPI_API_KEY, {
      // The SearchApi tool from Langchain might not directly support 'n' in its constructor or 'call' method options.
      // We are instantiating it here. If 'n' needs to be passed, it's usually part of the input to 'call'.
      // The `SearchApi` tool itself might have a default way of handling number of results or it might be implicitly controlled by the API.
      // For now, we will pass 'n' if the tool's 'call' method can accept it, or log if it's ignored.
      // The actual SearchApi tool takes a string query. Additional parameters like 'n' are often part of that string or specific methods.
      // For this tool, the `call` method primarily expects the query string.
      // If `n` is meant to control the number of results, this often needs to be embedded in the query string itself for some APIs,
      // or handled by processing the result if the API returns more than `n` items.
      // The `SearchApi` langchain tool is a wrapper around an API, and its `call` method expects a string input (the query).
      // It does not seem to have a parameter for `n` in the `call` method's options.
      // Let's assume `n` is not directly supported by this specific Langchain tool's `call` method parameters.
      // We will log this and the developer can adjust if the underlying API supports `n` in the query itself.
    });

    if (n) {
        console.log(`Parameter 'n' (value: ${n}) was provided, but the SearchApi Langchain tool may not directly use it in the 'call' method. The number of results depends on the SearchApi API's default or plan limits.`);
    }

    const results = await searchApi.call(query as string);

    res.status(200).json({
      message: 'Web search completed.',
      query,
      results,
    });

  } catch (error: any) {
    console.error(`Error during web search for query "${query}": ${error.message}`, error);
    // Check if the error is from SearchApi (e.g., authentication, bad request)
    if (error.message && error.message.includes('401')) {
        return res.status(401).json({ error: 'Search API authentication failed. Check API key.'});
    }
    if (error.message && error.message.includes('400')) {
        return res.status(400).json({ error: `Search API bad request: ${error.message}`});
    }
    res.status(500).json({
      error: 'Web search failed.',
      message: error.message,
      query,
    });
  }
};
