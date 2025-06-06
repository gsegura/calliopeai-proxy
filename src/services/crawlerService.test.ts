import { CrawlerService, CrawlerOptions, CrawledData } from './crawlerService';
import { PlaywrightCrawler, Request, PlaywrightCrawlingContext, EnqueueLinksOptions, RequestOptions, Log } from 'crawlee';
import { Page } from 'playwright';

// Shared variable for the mock to capture the requestHandler
let requestHandlerToExecute: ((context: PlaywrightCrawlingContext) => Promise<void>) | null = null;
let crawlerOptionsPassedToConstructor: any = null;

const mockActualCrawlerInstance = {
  run: jest.fn().mockImplementation(async function() {
    if (requestHandlerToExecute && mockInitialRequests.length > 0 && mockInitialRequests[0]) {
      const firstRequest = mockInitialRequests[0];
      const mockPage = {
        title: jest.fn().mockResolvedValue('Mock Title'),
        url: jest.fn().mockReturnValue(firstRequest.url),
        evaluate: jest.fn().mockImplementation(async (fnOrCode: string | ((...args: any[]) => any)) => {
          if (typeof fnOrCode === 'function' && fnOrCode.toString().includes('document.body.innerText')) {
            return 'Mock body snippet';
          }
          return [];
        }),
      } as unknown as Page;

      const mockEnqueueLinks = jest.fn().mockImplementation(async (options?: EnqueueLinksOptions | undefined) => {
        if (options?.transformRequestFunction) {
            const potentialReq = { url: 'http://example.com/transformed', userData: {} };
            const transformed = options.transformRequestFunction(potentialReq);
            if (transformed) {
                return { processedRequests: [{url: transformed.url, loadedUrl: transformed.url, id: transformed.id || 'mockid'}] };
            }
        }
        return { processedRequests: [] };
      });

      const mockContext = {
        request: firstRequest,
        page: mockPage,
        enqueueLinks: mockEnqueueLinks,
        log: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() } as Log,
        pushData: jest.fn().mockResolvedValue(undefined),
        getKeyValueStore: jest.fn().mockResolvedValue(null),
        setValue: jest.fn().mockResolvedValue(undefined),
        getValue: jest.fn().mockResolvedValue(null),
        addRequests: jest.fn().mockResolvedValue([]),
      } as any as PlaywrightCrawlingContext;

      await requestHandlerToExecute(mockContext);
    }
  }),
  addRequests: jest.fn().mockImplementation((requests: (Request | string | RequestOptions)[]) => {
    const requestInstances = requests.map((r: string | Request | RequestOptions) => {
        if (typeof r === 'string') return new Request({ url: r });
        if (r instanceof Request) return r;
        return new Request(r);
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
        warn: jest.fn(),
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
            } as unknown as Page,
            enqueueLinks: mockEnqueueLinksFn,
            log: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() } as Log,
          } as Partial<PlaywrightCrawlingContext> as PlaywrightCrawlingContext);
        },
        addRequests: jest.fn((reqs: (Request | string | RequestOptions)[]) => mockInitialRequests.push(...reqs.map((r: string | Request | RequestOptions) => new Request(r instanceof Request ? r.toJSON() : r)))),
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
            } as unknown as Page,
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
            log: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() } as Log,
          } as Partial<PlaywrightCrawlingContext> as PlaywrightCrawlingContext);
        },
        addRequests: jest.fn((reqs: (Request | string | RequestOptions)[]) => mockInitialRequests.push(...reqs.map((r: string | Request | RequestOptions) => new Request(r instanceof Request ? r.toJSON() : r )))),
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
            const mockFailedRequest = new Request({ url: options.startUrl, userData: { depth: 0 } });
            (mockFailedRequest as any).errorMessages = ['Failed due to mock'];

            await localFailedRequestHandler({
              request: mockFailedRequest,
              log: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() } as Log,
            } as Partial<PlaywrightCrawlingContext> as PlaywrightCrawlingContext);
          }
        },
        addRequests: jest.fn((reqs: (Request | string | RequestOptions)[]) => mockInitialRequests.push(...reqs.map((r: string | Request | RequestOptions) => new Request(r instanceof Request ? r.toJSON() : r)))),
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
