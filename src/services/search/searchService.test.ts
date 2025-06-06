import { SearchService } from '../search/searchService';
import { SearchServiceProvider, SearchResult } from '../search/searchInterface';

// Mock search provider for testing
class MockSearchProvider implements SearchServiceProvider {
  private mockResults: SearchResult[] = [
    {
      title: 'Test Result 1',
      link: 'https://example.com/1',
      snippet: 'This is test result 1'
    },
    {
      title: 'Test Result 2',
      link: 'https://example.com/2',
      snippet: 'This is test result 2'
    }
  ];
  
  getName(): string {
    return 'MockProvider';
  }
  
  async search(query: string): Promise<SearchResult[]> {
    // Return filtered results based on query for testing
    return this.mockResults.filter(result => 
      (result.title?.includes(query) ?? false) || 
      (result.snippet?.includes(query) ?? false) ||
      query === '*'
    );
  }
}

describe('SearchService', () => {
  let searchService: SearchService;
  let mockProvider: MockSearchProvider;
  
  beforeEach(() => {
    mockProvider = new MockSearchProvider();
    searchService = new SearchService(mockProvider);
  });
  
  test('should return provider name', () => {
    expect(searchService.getProviderName()).toBe('MockProvider');
  });
  
  test('should return search results', async () => {
    const results = await searchService.search('*');
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Test Result 1');
    expect(results[1].link).toBe('https://example.com/2');
  });
  
  test('should filter results based on query', async () => {
    const results = await searchService.search('2');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Result 2');
  });
});
