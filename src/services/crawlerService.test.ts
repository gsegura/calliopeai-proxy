import { CrawlerService, CrawledData, CrawlerOptions } from './crawlerService';
import axios from 'axios';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from 'langchain/document';

// Mock PlaywrightCrawler and its methods from 'crawlee'
// Keep this high-level unless specific interactions need to be tested.
const mockEnqueueLinks = jest.fn();
const mockRun = jest.fn();
const mockAddRequests = jest.fn();

jest.mock('crawlee', () => ({
  PlaywrightCrawler: jest.fn().mockImplementation(({ requestHandler, failedRequestHandler }) => ({
    run: mockRun,
    addRequests: mockAddRequests,
    requestHandler: requestHandler, // Store to call manually if needed
    failedRequestHandler: failedRequestHandler, // Store to call manually
  })),
  log: {
    setLevel: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(), // Added warn mock
    LEVELS: { // Add the LEVELS object
      ERROR: 9, // Value doesn't strictly matter for most tests, just that it exists
      INFO: 7,
      DEBUG: 5,
      WARN: 8, // if crawlee uses it
    }
  },
  EnqueueLinksOptions: {}, // Mock if it's used as a type or value
}));


// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Langchain classes
jest.mock('@langchain/openai');
const mockedOpenAIEmbeddings = OpenAIEmbeddings as jest.MockedClass<typeof OpenAIEmbeddings>;

jest.mock('langchain/vectorstores/memory');
const mockedMemoryVectorStore = MemoryVectorStore as jest.MockedClass<typeof MemoryVectorStore>;
const mockAddDocuments = jest.fn();
const mockSimilaritySearch = jest.fn();

// Assign mock implementations to the prototype for MemoryVectorStore
mockedMemoryVectorStore.prototype.addDocuments = mockAddDocuments;
mockedMemoryVectorStore.prototype.similaritySearch = mockSimilaritySearch;


describe('CrawlerService', () => {
  let originalOpenAIApiKey: string | undefined;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;


  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Store and clear the OPENAI_API_KEY
    originalOpenAIApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    // Spy on console methods
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});


    // Default mock implementations
    mockedAxios.post.mockResolvedValue({ data: '## Mocked Markdown Content' });
    mockAddDocuments.mockResolvedValue(undefined);
    mockSimilaritySearch.mockResolvedValue([]);

    // Reset PlaywrightCrawler mock implementation for each test to ensure clean state
     const { PlaywrightCrawler: MockPlaywrightCrawler } = require('crawlee');
     MockPlaywrightCrawler.mockImplementation(({ requestHandler, failedRequestHandler }: any) => ({
        run: mockRun.mockImplementation(async () => {
            // This is a simplified simulation.
            // For `launchCrawl` tests, we often trigger `requestHandler` manually.
            // Ensure `addRequests` is called before `run` resolves if needed.
            return Promise.resolve();
        }),
        addRequests: mockAddRequests,
        // Store handler to be callable if direct invocation is simpler for a test
        __handler: requestHandler,
        __failedHandler: failedRequestHandler
    }));
  });

  afterEach(() => {
    // Restore the OPENAI_API_KEY
    if (originalOpenAIApiKey) {
      process.env.OPENAI_API_KEY = originalOpenAIApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    // Restore console spies
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  const getMockPage = (url = 'http://example.com/test') => ({
    title: jest.fn().mockResolvedValue('Test Page Title'),
    content: jest.fn().mockResolvedValue('<html><body><h1>Test Content</h1></body></html>'),
    url: jest.fn().mockReturnValue(url),
    evaluate: jest.fn().mockResolvedValue('Test body text snippet from evaluate'),
  });

  // Helper to get the captured requestHandler from the mock crawler
  const getCapturedRequestHandler = () => {
    const MockPlaywrightCrawler = require('crawlee').PlaywrightCrawler;
    const mockCrawlerInstance = MockPlaywrightCrawler.mock.results[0]?.value;
    if (mockCrawlerInstance && mockCrawlerInstance.__handler) {
        return mockCrawlerInstance.__handler;
    }
    // Fallback or error if not found, though test structure should ensure it is.
    // This might happen if launchCrawl wasn't called, or crawler mock failed.
    // console.error("Mock PlaywrightCrawler instance:", MockPlaywrightCrawler.mock);
    // console.error("Instance value:", mockCrawlerInstance);
    throw new Error("requestHandler not captured from PlaywrightCrawler mock. Ensure CrawlerService.launchCrawl() was called.");
  };


  const getMockContext = (page?: any, request?: any) => ({
    request: request || { url: 'http://example.com/test', userData: { depth: 0 } },
    page: page || getMockPage(),
    enqueueLinks: mockEnqueueLinks,
    log: require('crawlee').log,
  });

  describe('Constructor and Initialization', () => {
    it('should initialize OpenAIEmbeddings and MemoryVectorStore if OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      new CrawlerService();
      expect(mockedOpenAIEmbeddings).toHaveBeenCalledTimes(1);
      expect(mockedOpenAIEmbeddings).toHaveBeenCalledWith({ openAIApiKey: 'test-api-key' });
      expect(mockedMemoryVectorStore).toHaveBeenCalledTimes(1);
      expect(mockedMemoryVectorStore).toHaveBeenCalledWith(expect.any(mockedOpenAIEmbeddings));
      expect(consoleLogSpy).toHaveBeenCalledWith('CrawlerService: OpenAIEmbeddings and MemoryVectorStore initialized successfully.');
    });

    it('should log a warning and not initialize vector store if OPENAI_API_KEY is missing', () => {
      new CrawlerService(); // API key is deleted in beforeEach
      expect(mockedOpenAIEmbeddings).not.toHaveBeenCalled();
      expect(mockedMemoryVectorStore).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('OPENAI_API_KEY is not set. Vector store will not be initialized. Crawled data will not be added to embeddings.');
    });

     it('should handle errors during OpenAIEmbeddings initialization and not init vector store', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      const error = new Error('OpenAI API Error');
      mockedOpenAIEmbeddings.mockImplementationOnce(() => { throw error; });

      new CrawlerService();

      expect(mockedOpenAIEmbeddings).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('CrawlerService: Failed to initialize OpenAIEmbeddings or MemoryVectorStore:', error.message);
      expect(mockedMemoryVectorStore).not.toHaveBeenCalled(); // Crucially, MemoryVectorStore constructor should not be called if embeddings failed
    });
  });

  describe('launchCrawl', () => {
    const crawlOptions: CrawlerOptions = {
      startUrl: 'http://example.com',
      maxDepth: 1,
      maxRequests: 1,
    };

    it('should successfully crawl, call Markitdown, and store document if API key is present', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      const service = new CrawlerService(); // Initializes embeddings and vector store

      const mockPageInstance = getMockPage();
      const mockContext = getMockContext(mockPageInstance);

      // Call launchCrawl to setup the crawler instance and its requestHandler
      const crawlPromise = service.launchCrawl(crawlOptions);

      // Get the requestHandler captured by the mock PlaywrightCrawler
      const requestHandler = getCapturedRequestHandler();
      await requestHandler(mockContext); // Manually invoke the handler

      // Ensure the outer launchCrawl promise also resolves
      // (mockRun will resolve immediately as per its mock implementation)
      const results = await crawlPromise;

      expect(mockAddRequests).toHaveBeenCalledWith([{ url: crawlOptions.startUrl, userData: { depth: 0 } }]);
      expect(mockRun).toHaveBeenCalled();
      expect(mockedAxios.post).toHaveBeenCalledWith('http://markitdown:8080', '<html><body><h1>Test Content</h1></body></html>', {
        headers: { 'Content-Type': 'text/html' },
        timeout: 30000,
      });
      expect(mockAddDocuments).toHaveBeenCalledTimes(1);

      const documentCall = mockAddDocuments.mock.calls[0][0][0]; // Get the first document from the first call
      expect(documentCall.pageContent).toBe('## Mocked Markdown Content');
      expect(documentCall.metadata).toEqual({
        url: 'http://example.com/test',
        title: 'Test Page Title',
        path: '/test',
      });
      expect(results.length).toBe(1);
      expect(results[0].markdownContent).toBe('## Mocked Markdown Content');
      expect(results[0].error).toBeUndefined();
    });

    it('should handle Markitdown service error and not call addDocuments', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      mockedAxios.post.mockRejectedValueOnce(new Error('Markitdown service unavailable'));

      const service = new CrawlerService();
      const mockPageInstance = getMockPage();
      const mockContext = getMockContext(mockPageInstance);

      const crawlPromise = service.launchCrawl(crawlOptions);
      const requestHandler = getCapturedRequestHandler();
      await requestHandler(mockContext);
      const results = await crawlPromise;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockAddDocuments).not.toHaveBeenCalled();
      expect(results[0].error).toContain('Failed to convert HTML to Markdown: Markitdown service unavailable');
      expect(results[0].markdownContent).toBeUndefined();
      expect(require('crawlee').log.error).toHaveBeenCalledWith("Error calling Markitdown service for http://example.com/test: Markitdown service unavailable");
    });

    it('should handle vector store addDocuments error', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      mockAddDocuments.mockRejectedValueOnce(new Error('Vector store failed'));

      const service = new CrawlerService();
      const mockPageInstance = getMockPage();
      const mockContext = getMockContext(mockPageInstance);

      const crawlPromise = service.launchCrawl(crawlOptions);
      const requestHandler = getCapturedRequestHandler();
      await requestHandler(mockContext);
      const results = await crawlPromise;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockAddDocuments).toHaveBeenCalledTimes(1); // It was called
      expect(results[0].error).toContain('Failed to add to vector store: Vector store failed');
      expect(results[0].markdownContent).toBe('## Mocked Markdown Content'); // Markdown was fetched
      expect(require('crawlee').log.error).toHaveBeenCalledWith("Error adding document to vector store for http://example.com/test: Vector store failed");
    });

    it('should not attempt to add document if OPENAI_API_KEY is missing', async () => {
      // Key is deleted in beforeEach
      const service = new CrawlerService(); // Vector store not initialized based on consoleWarnSpy

      const mockPageInstance = getMockPage();
      const mockContext = getMockContext(mockPageInstance);

      const crawlPromise = service.launchCrawl(crawlOptions);
      const requestHandler = getCapturedRequestHandler();
      await requestHandler(mockContext);
      const results = await crawlPromise;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockAddDocuments).not.toHaveBeenCalled();

      // Check console warnings
      expect(consoleWarnSpy).toHaveBeenCalledWith('OPENAI_API_KEY is not set. Vector store will not be initialized. Crawled data will not be added to embeddings.'); // From constructor
      expect(consoleWarnSpy).toHaveBeenCalledWith("Vector store not initialized. Skipping adding content from http://example.com/test to vector store."); // From requestHandler
      expect(results[0].markdownContent).toBe('## Mocked Markdown Content'); // Markdown still fetched
      expect(results[0].error).toBeUndefined(); // No error should be reported for this case
    });
  });

  describe('searchSimilarDocuments', () => {
    it('should call vectorStore.similaritySearch if initialized and return results', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      const service = new CrawlerService();
      const mockSearchResults = [{ pageContent: 'doc1', metadata: { url: 'u1'} }];
      mockSimilaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.searchSimilarDocuments('test query', 3);

      expect(mockSimilaritySearch).toHaveBeenCalledTimes(1);
      expect(mockSimilaritySearch).toHaveBeenCalledWith('test query', 3);
      expect(results).toEqual(mockSearchResults);
      expect(consoleLogSpy).toHaveBeenCalledWith(`Found ${mockSearchResults.length} similar documents for query: "test query"`);
    });

    it('should return empty array and log warning if vector store not initialized', async () => {
      // API key is cleared in beforeEach
      const service = new CrawlerService();
      const results = await service.searchSimilarDocuments('test query');

      expect(mockSimilaritySearch).not.toHaveBeenCalled();
      expect(results).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Search attempted but vector store is not initialized.');
    });

    it('should handle errors during similaritySearch and return empty array', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      const service = new CrawlerService();
      const error = new Error('Search similarity failed');
      mockSimilaritySearch.mockRejectedValueOnce(error);

      const results = await service.searchSimilarDocuments('test query');

      expect(mockSimilaritySearch).toHaveBeenCalledTimes(1);
      expect(results).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error during similarity search:', error.message);
    });
  });
});
