import { CrawlerService, CrawlerOptions, CrawledData } from './crawlerService';
import { PlaywrightCrawler, Request, CrawlingContext, Dictionary, PlaywrightCrawlingContext, EnqueueLinksOptions } from 'crawlee';
import { Page } from 'playwright';

// Shared variable for the mock to capture the requestHandler
let requestHandlerToExecute: ((context: PlaywrightCrawlingContext) => Promise<void>) | null = null;
let crawlerOptionsPassedToConstructor: any = null;

// Mock Crawlee's PlaywrightCrawler
// This is a global mock for all tests, but can be overridden by mockImplementationOnce
const mockActualCrawlerInstance = {
  run: jest.fn().mockImplementation(async function() { // 'this' would be mockActualCrawlerInstance
    // Simulate processing the initial request using the captured requestHandler
    if (requestHandlerToExecute && mockInitialRequests.length > 0 && mockInitialRequests[0]) {
      const firstRequest = mockInitialRequests[0]; // Should be a full Request object
      const mockPage: Page = {
        title: jest.fn().mockResolvedValue('Mock Title'),
        url: jest.fn().mockReturnValue(firstRequest.url), // Use page.url() as service does
        evaluate: jest.fn().mockImplementation(async (fnOrCode: string | ((...args: any[]) => any), ...args: any[]) => {
          if (typeof fnOrCode === 'function') {
            if (fnOrCode.toString().includes('document.body.innerText')) {
              return 'Mock body snippet';
            }
          }
          return []; // Default for other evaluations (e.g., link extraction if it were page.evaluate)
        }),
        // Add other Page methods if the service uses them directly and they need specific mock behavior
      } as unknown as Page; // Cast to Page, acknowledging it's a partial mock

      const mockEnqueueLinks = jest.fn().mockImplementation(async (options?: EnqueueLinksOptions | undefined) => {
        // If a transformRequestFunction is provided in the options by the service,
        // we should simulate its call for any dummy links found.
        if (options?.transformRequestFunction) {
            // Simulate finding one link to test transformRequestFunction
            const potentialReq = { url: 'http://example.com/transformed', userData: {} };
            const transformed = options.transformRequestFunction(potentialReq);
            if (transformed) {
                return { processedRequests: [{url: transformed.url, loadedUrl: transformed.url, id: transformed.id || 'mockid'}] };
            }
        }
        return { processedRequests: [] };
      });

      const mockContext: PlaywrightCrawlingContext = {
        request: firstRequest,
        page: mockPage,
        enqueueLinks: mockEnqueueLinks,
        log: { info: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
        pushData: jest.fn().mockResolvedValue(undefined),
        session: undefined,
        proxyInfo: undefined,
        response: undefined,
        crawler: PlaywrightCrawler as any,
        sendRequest: jest.fn() as any,
        parseWithCheerio: jest.fn() as any,
        $: {} as any,
        jQuery: {} as any,
        body: '',
      };
      await requestHandlerToExecute(mockContext);
    }
  }),
  addRequests: jest.fn().mockImplementation((requests: (Request | string | Record<string, any>)[]) => {
    const requestInstances = requests.map(r => {
        if (typeof r === 'string') return new Request({ url: r });
        if (r instanceof Request) return r;
        return new Request(r as any);
    });
    mockInitialRequests.push(...requestInstances);
    return Promise.resolve();
  }),
};

jest.mock('crawlee', () => {
  const originalCrawlee = jest.requireActual('crawlee');
  return {
    ...originalCrawlee,
    PlaywrightCrawler: jest.fn().mockImplementation((options: any) => {
      requestHandlerToExecute = options.requestHandler;
      crawlerOptionsPassedToConstructor = options;
      return { ...mockActualCrawlerInstance };
    }),
    Request: originalCrawlee.Request,
    log: {
        ...originalCrawlee.log,
        setLevel: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }
  };
});

let mockInitialRequests: Request[] = [];

describe('CrawlerService', () => {
  let crawlerService: CrawlerService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialRequests = [];
    requestHandlerToExecute = null;
    crawlerOptionsPassedToConstructor = null;
    crawlerService = new CrawlerService();

    const crawleeLogMock = require('crawlee').log;
    crawleeLogMock.setLevel.mockClear();

  });

  it('should initialize and run the crawler with given options', async () => {
    const options: CrawlerOptions = {
      startUrl: 'http://example.com',
      maxDepth: 1,
      maxRequests: 5,
    };

    await crawlerService.launchCrawl(options);

    expect(PlaywrightCrawler).toHaveBeenCalledWith(expect.objectContaining({
      maxRequestsPerCrawl: options.maxRequests,
      requestHandlerTimeoutSecs: 60,
      navigationTimeoutSecs: 60,
    }));

    expect(mockActualCrawlerInstance.addRequests).toHaveBeenCalledWith([{ url: options.startUrl, userData: { depth: 0 } }]);
    expect(mockActualCrawlerInstance.run).toHaveBeenCalled();
  });

  it('should collect data from the crawled page', async () => {
    const options: CrawlerOptions = {
      startUrl: 'http://example.com/page1',
      maxDepth: 0,
      maxRequests: 1,
    };

    const results = await crawlerService.launchCrawl(options);

    expect(results.length).toBe(1);
    expect(results[0]).toEqual(expect.objectContaining({
      url: 'http://example.com/page1',
      title: 'Mock Title',
      bodySnippet: 'Mock body snippet',
      path: '/page1',
    }));
  });

  it('should respect maxDepth and not process deeper items from queue', async () => {
    const options: CrawlerOptions = {
      startUrl: 'http://example.com',
      maxDepth: 0,
      maxRequests: 5,
    };

    const MockPlaywrightCrawler = PlaywrightCrawler as jest.MockedClass<typeof PlaywrightCrawler>;
    const mockEnqueueLinksFn = jest.fn().mockResolvedValue({ processedRequests: [] });

    MockPlaywrightCrawler.mockImplementationOnce((crawlerOpts: any): any => {
      const localRequestHandler = crawlerOpts.requestHandler;
      return {
        run: async () => {
          await localRequestHandler({
            request: new Request({ url: options.startUrl, userData: { depth: 0 } }),
            page: {
              title: async () => 'Depth 0 Title',
              url: () => options.startUrl,
              evaluate: async () => 'Depth 0 snippet',
            } as Page,
            enqueueLinks: mockEnqueueLinksFn,
            log: { info: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
          });
        },
        addRequests: jest.fn((reqs) => mockInitialRequests.push(...reqs.map(r => new Request(r as any)))),
      };
    });

    const results = await crawlerService.launchCrawl(options);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Depth 0 Title');
    expect(mockEnqueueLinksFn).toHaveBeenCalled();
  });


  it('should respect maxRequests via transformRequestFunction in enqueueLinks', async () => {
    const options: CrawlerOptions = {
      startUrl: 'http://example.com',
      maxDepth: 1,
      maxRequests: 1,
    };

    const MockPlaywrightCrawler = PlaywrightCrawler as jest.MockedClass<typeof PlaywrightCrawler>;
    const localMockEnqueueLinks = jest.fn();

    MockPlaywrightCrawler.mockImplementationOnce((crawlerCtorOptions: any): any => {
      const serviceRequestHandler = crawlerCtorOptions.requestHandler;
      return {
        run: async () => {
          await serviceRequestHandler({
            request: new Request({ url: options.startUrl, userData: { depth: 0 } }),
            page: {
              title: async () => 'Page 1',
              url: () => options.startUrl,
              evaluate: async () => 'snippet1',
            } as Page,
            enqueueLinks: localMockEnqueueLinks.mockImplementation(async (linkOpts: EnqueueLinksOptions) => {
              if (linkOpts.transformRequestFunction) {
                const reqToTransform = { url: 'http://example.com/link2', userData: {} };
                const transformed = linkOpts.transformRequestFunction(reqToTransform);
                if (transformed) {
                  return { processedRequests: [{url: transformed.url, loadedUrl: transformed.url, id: 'id2'}] };
                }
              }
              return { processedRequests: [] };
            }),
            log: { info: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
          });
        },
        addRequests: jest.fn((reqs) => mockInitialRequests.push(...reqs.map(r => new Request(r as any)))),
      };
    });

    const results = await crawlerService.launchCrawl(options);
    expect(results.length).toBe(1);
    expect(localMockEnqueueLinks).toHaveBeenCalled();
  });


  it('should handle failed requests and record errors', async () => {
    const options: CrawlerOptions = {
      startUrl: 'http://broken.com',
      maxDepth: 0,
      maxRequests: 1,
    };

    const MockPlaywrightCrawler = PlaywrightCrawler as jest.MockedClass<typeof PlaywrightCrawler>;
    MockPlaywrightCrawler.mockImplementationOnce((crawlerOpts: any): any => {
      const localFailedRequestHandler = crawlerOpts.failedRequestHandler;
      return {
        run: async () => {
          if (localFailedRequestHandler) {
            await localFailedRequestHandler({
              request: new Request({ url: options.startUrl, userData: { depth: 0 }, errorMessages: ['Failed due to mock'] }),
              log: { info: jest.fn(), error: jest.fn() } as any,
            });
          }
        },
        addRequests: jest.fn((reqs) => mockInitialRequests.push(...reqs.map(r => new Request(r as any)))),
      };
    });

    const results = await crawlerService.launchCrawl(options);
    expect(results.length).toBe(1);
    expect(results[0]).toEqual(expect.objectContaining({
      url: 'http://broken.com',
      error: 'Failed to crawl: Failed due to mock',
      path: '/',
    }));
  });
});
