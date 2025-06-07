import { TavilySearchResponse, TavilySearch } from '@langchain/tavily';
import { SearchOptions, ContextItem, SearchServiceProvider } from './searchInterface';

export class TavilyProvider implements SearchServiceProvider {
  private client: TavilySearch;
  
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Tavily API key is required');
    }
    
    this.client = new TavilySearch({ 
      tavilyApiKey: apiKey,
      maxResults: 10,
      includeRawContent: false
    });
  }
  
  getName(): string {
    return 'Tavily';
  }
  
  async search(query: string, options?: SearchOptions): Promise<ContextItem[]> {
    try {
      // Build input object for Tavily search
      const searchInput = {
        query,
        topic: 'general' as 'general' | 'news' | 'finance' | undefined,
        includeImages: options?.includeImages,
        timeRange: undefined as 'day' | 'week' | 'month' | 'year' | undefined,
        includeDomains: undefined as string[] | undefined,
        excludeDomains: undefined as string[] | undefined,
        searchDepth: undefined as 'basic' | 'advanced' | undefined
      };
      
      // Map our options to Tavily options
      if (options) {
        if (options.topic) {
          // Map our topic to Tavily topics (general, news, finance)
          if (options.topic === 'technical') {
            searchInput.searchDepth = 'advanced';
          } else if (['general', 'news', 'finance'].includes(options.topic)) {
            searchInput.topic = options.topic as 'general' | 'news' | 'finance';
          }
        }
        if (options.timeRange && ['day', 'week', 'month', 'year'].includes(options.timeRange)) {
          searchInput.timeRange = options.timeRange as 'day' | 'week' | 'month' | 'year';
        }
      }
      
      // Call Tavily Search API
      const results = await this.client.invoke(searchInput) as TavilySearchResponse;
      
      // If an error was returned
      if ('error' in results) {
        throw new Error(`Tavily search error: ${results.error}`);
      }
      
      // Map Tavily results to our standard SearchResult format
      return results.results.map((result: any) => ({
        name: result.title || '',
        uri: result.url || '',
        description: result.content || '',
        content: result.raw_content || result.content || '', // Prefer raw_content if available
      }));
    } catch (error) {
      console.error('Tavily search error:', error);
      throw error;
    }
  }
}
