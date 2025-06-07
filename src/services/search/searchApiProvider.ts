import { SearchApi } from '@langchain/community/tools/searchapi';
import { SearchOptions, ContextItem, SearchServiceProvider } from './searchInterface';

export class SearchApiProvider implements SearchServiceProvider {
  private searchApi: SearchApi;
  
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SearchAPI API key is required');
    }
    
    this.searchApi = new SearchApi(apiKey);
  }
  
  getName(): string {
    return 'SearchAPI';
  }
  
  async search(query: string, options?: SearchOptions): Promise<ContextItem[]> {
    try {
      // SearchAPI doesn't support many options directly through the Langchain wrapper
      if (options?.maxResults) {
        console.log(`SearchAPI provider note: maxResults (${options.maxResults}) may not be respected as SearchAPI doesn't directly support limiting results.`);
      }
      
      const rawResults = await this.searchApi.call(query);
      
      // Parse results - the format may vary based on the SearchAPI response
      let parsedResults: ContextItem[] = [];
      
      try {
        const jsonResults = typeof rawResults === 'string' ? JSON.parse(rawResults) : rawResults;
        
        if (Array.isArray(jsonResults)) {
          parsedResults = jsonResults.map((result: any) => ({
            name: result.title || '',
            uri: result.link || '',
            description: result.snippet || result.description || '',
            content: result.content || result.snippet || result.description || '', // Attempt to find content
          }));
        } else if (jsonResults.results && Array.isArray(jsonResults.results)) {
          parsedResults = jsonResults.results.map((result: any) => ({
            name: result.title || '',
            uri: result.link || '',
            description: result.snippet || result.description || '',
            content: result.content || result.snippet || result.description || '', // Attempt to find content
          }));
        }
      } catch (parseError: any) {
        console.error('Error parsing SearchAPI results:', parseError);
        throw new Error(`Failed to parse SearchAPI results: ${parseError.message}`);
      }
      
      return parsedResults;
    } catch (error) {
      console.error('SearchAPI search error:', error);
      throw error;
    }
  }
}
