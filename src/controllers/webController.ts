import { Request, Response, NextFunction } from 'express';
import { SearchService } from '../services/search/searchService';
import { ContextItem } from '../services/search/searchInterface';

// Create a singleton instance of the SearchService
const searchService = new SearchService();

// Helper function to validate ContextItem format
const validateContextItems = (items: any[]): items is ContextItem[] => {
  return items.every(item => 
    typeof item === 'object' &&
    typeof item.content === 'string' &&
    typeof item.name === 'string' &&
    typeof item.description === 'string'
  );
};

export const searchWeb = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { query, n } = req.body; // n is for the number of results

    if (!query) {
      res.status(400).json({ error: 'Missing required parameter: query' });
      return;
    }

    console.log(`Received web search request for query: "${query}"${n ? ` with n: ${n}` : ''}`);

    // Use the search service with options
    const options = n ? { maxResults: n } : undefined;
    const results = await searchService.search(query, options);

    // Validate response format
    if (!Array.isArray(results)) {
      throw new Error('Search service returned invalid format: expected array');
    }

    if (!validateContextItems(results)) {
      throw new Error('Search service returned invalid ContextItem format');
    }

    // Get the name of the provider that was used
    const providerName = searchService.getProviderName();
    
    res.status(200).json(results);

  } catch (error: any) {
    console.error(`Error during web search for query "${req.body?.query}": ${error.message}`, error);
    
    // Handle common error cases
    if (error.message && error.message.includes('401')) {
        res.status(401).json({ error: 'Search API authentication failed. Check API key.'});
        return;
    }
    if (error.message && error.message.includes('400')) {
        res.status(400).json({ error: `Search API bad request: ${error.message}`});
        return;
    }
    
    // Forward other errors to global error handler
    next(error);
  }
};
