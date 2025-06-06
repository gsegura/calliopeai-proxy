import { SearchServiceProvider } from './searchInterface';
import { SearchApiProvider } from './searchApiProvider';
import { TavilyProvider } from './tavilyProvider';

export type SearchProviderType = 'searchapi' | 'tavily';

export class SearchServiceFactory {
  private static instances: Map<string, SearchServiceProvider> = new Map();
  
  /**
   * Get a search service provider based on the provider type
   * @param providerType The type of search provider to create
   * @param apiKey API key for the provider
   * @returns A search service provider instance
   */
  public static getProvider(providerType: SearchProviderType, apiKey: string): SearchServiceProvider {
    const key = `${providerType}:${apiKey}`;
    
    if (!this.instances.has(key)) {
      let provider: SearchServiceProvider;
      
      switch (providerType.toLowerCase()) {
        case 'searchapi':
          provider = new SearchApiProvider(apiKey);
          break;
        case 'tavily':
          provider = new TavilyProvider(apiKey);
          break;
        default:
          throw new Error(`Unsupported search provider type: ${providerType}`);
      }
      
      this.instances.set(key, provider);
    }
    
    return this.instances.get(key)!;
  }
  
  /**
   * Get the default provider based on environment configuration
   * @returns The default search service provider
   */
  public static getDefaultProvider(): SearchServiceProvider {
    // Prioritize Tavily if the API key is available
    if (process.env.TAVILY_API_KEY) {
      return this.getProvider('tavily', process.env.TAVILY_API_KEY);
    }
    
    // Fall back to SearchAPI if available
    if (process.env.SEARCHAPI_API_KEY) {
      return this.getProvider('searchapi', process.env.SEARCHAPI_API_KEY);
    }
    
    // No valid provider configured
    throw new Error('No search provider API keys found in environment variables. Please set TAVILY_API_KEY or SEARCHAPI_API_KEY.');
  }
}
