import { SearchOptions, SearchResult, SearchServiceProvider } from './searchInterface';
import { SearchServiceFactory, SearchProviderType } from './searchServiceFactory';

export class SearchService {
  private provider: SearchServiceProvider;
  
  /**
   * Create a new SearchService
   * @param provider Optional provider to use. If not provided, the default provider from factory will be used.
   */
  constructor(provider?: SearchServiceProvider) {
    this.provider = provider || SearchServiceFactory.getDefaultProvider();
  }
  
  /**
   * Create a new SearchService with a specific provider type
   * @param providerType Type of provider to use
   * @param apiKey API key for the provider
   * @returns A new SearchService instance
   */
  public static withProvider(providerType: SearchProviderType, apiKey: string): SearchService {
    const provider = SearchServiceFactory.getProvider(providerType, apiKey);
    return new SearchService(provider);
  }
  
  /**
   * Get the current provider name
   * @returns The name of the current provider
   */
  public getProviderName(): string {
    return this.provider.getName();
  }
  
  /**
   * Perform a search with the configured provider
   * @param query Search query
   * @param options Optional search options
   * @returns Search results
   */
  public async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return await this.provider.search(query, options);
  }
}
