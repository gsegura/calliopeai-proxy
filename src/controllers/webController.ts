import { Request, Response, NextFunction } from 'express';
import { SearchService } from '../services/search/searchService';

// Create a singleton instance of the SearchService
const searchService = new SearchService();

export const searchWeb = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { query, n } = req.body; // n is for the number of results

  if (!query) {
    res.status(400).json({ error: 'Missing required parameter: query' });
    return;
  }

  console.log(`Received web search request for query: "${query}"${n ? ` with n: ${n}` : ''}`);

  try {
    // Use the search service with options
    const options = n ? { maxResults: n } : undefined;
    const results = await searchService.search(query, options);

    // Get the name of the provider that was used
    const providerName = searchService.getProviderName();
    
    res.status(200).json(results);

  } catch (error: any) {
    console.error(`Error during web search for query "${query}": ${error.message}`, error);
    
    // Handle common error cases
    if (error.message && error.message.includes('401')) {
        res.status(401).json({ error: 'Search API authentication failed. Check API key.'});
        return;
    }
    if (error.message && error.message.includes('400')) {
        res.status(400).json({ error: `Search API bad request: ${error.message}`});
        return;
    }
    
    // Generic error handling
    res.status(500).json({
      error: 'Web search failed.',
      message: error.message,
      query,
    });
  }
};
