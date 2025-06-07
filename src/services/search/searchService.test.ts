import { SearchService } from '../search/searchService';
import { SearchServiceProvider, ContextItem } from '../search/searchInterface';

// Mock search provider for testing
class MockSearchProvider implements SearchServiceProvider {
  private mockResults: ContextItem[] = [
    {
      name: 'Test Result 1',
      uri: 'https://example.com/1',
      description: 'This is test result 1',
      content: 'Content for test result 1'
    },
    {
      name: 'Test Result 2',
      uri: 'https://example.com/2',
      description: 'This is test result 2',
      content: 'Content for test result 2'
    }
  ];
  
  getName(): string {
    return 'MockProvider';
  }
  
  async search(query: string): Promise<ContextItem[]> {
    // Return filtered results based on query for testing
    return this.mockResults.filter(result => 
      (result.name?.includes(query) ?? false) || 
      (result.description?.includes(query) ?? false) ||
      query === '*',
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
    expect(results[0].name).toBe('Test Result 1');
    expect(results[1].uri).toBe('https://example.com/2');
  });
  
  test('should filter results based on query', async () => {
    const results = await searchService.search('2');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Test Result 2');
  });
});
