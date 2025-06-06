import { PlaywrightCrawler, log, PlaywrightCrawlingContext, EnqueueLinksOptions } from 'crawlee'; // Added EnqueueLinksOptions
import { Page } from 'playwright';

// Suppress non-error logs for cleaner output during normal operation, similar to controller
log.setLevel(log.LEVELS.ERROR);

export interface CrawledData {
  url: string;
  path: string;
  title?: string;
  bodySnippet?: string;
  error?: string;
}

export interface CrawlerOptions {
  startUrl: string;
  maxDepth: number;
  maxRequests: number;
}

export class CrawlerService {
  public async launchCrawl(options: CrawlerOptions): Promise<CrawledData[]> {
    const { startUrl, maxDepth, maxRequests } = options;

    console.log(`CrawlerService: Launching crawl for startUrl: "${startUrl}", maxDepth: ${maxDepth}, limit: ${maxRequests}`);

    const collectedData: CrawledData[] = [];

    const crawler = new PlaywrightCrawler({
      launchContext: {
        launchOptions: {
          headless: true,
        },
      },
      maxRequestsPerCrawl: maxRequests,
      minConcurrency: 1,
      maxConcurrency: 5,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 60,
      navigationTimeoutSecs: 60,

      requestHandler: async ({ request, page, enqueueLinks, log }: PlaywrightCrawlingContext & { page: Page }) => {
        const currentDepth = request.userData.depth || 0;
        if (currentDepth > maxDepth) {
          log.info(`Skipping ${request.url} due to depth: ${currentDepth} > ${maxDepth}`);
          return;
        }

        log.info(`Processing ${request.url} at depth ${currentDepth}...`);
        const title = await page.title();
        const url = page.url();
        const path = new URL(url).pathname;

        const bodyText = await page.evaluate(() => document.body.innerText);
        const bodySnippet = bodyText.substring(0, 1000).replace(/\s\s+/g, ' ').trim();

        const pageData: CrawledData = { url, path, title, bodySnippet };
        collectedData.push(pageData);

        if (currentDepth < maxDepth) {
          // Refined link enqueueing using enqueueLinks
          // This will find all <a> tags with href attributes
          // By default, it should handle relative and absolute URLs correctly based on the current page's URL.
          // It also respects the crawler's maxRequestsPerCrawl limit implicitly to some extent,
          // but we still keep an explicit check for collectedData.length for fine-grained control.

          // Define options for enqueueLinks, e.g., to only follow links on the same domain if desired
          const enqueueOptions: EnqueueLinksOptions = {
            // strategy: 'same-domain', // Uncomment if you only want to crawl links on the same domain
            // pseudoUrls: [ /* array of pseudo URLs to match */ ], // For more specific URL patterns
            transformRequestFunction: (req) => {
              // Only add if we haven't hit the global limit
              if (collectedData.length < maxRequests) {
                req.userData = { depth: currentDepth + 1 };
                return req;
              }
              return false; // Do not enqueue if limit is reached
            }
          };

          await enqueueLinks(enqueueOptions);
          log.info(`Enqueued links from ${url} with depth ${currentDepth + 1}. Total collected: ${collectedData.length}/${maxRequests}`);

        }
      },

      failedRequestHandler: async ({ request, log }) => {
        const errorMessage = request.errorMessages?.join(', ') || 'Unknown error';
        log.error(`Failed to crawl ${request.url}: ${errorMessage}`);
        const errorData: CrawledData = {
          url: request.url,
          path: new URL(request.url).pathname,
          error: `Failed to crawl: ${errorMessage}`,
        };
        collectedData.push(errorData);
      },
    });

    await crawler.addRequests([{ url: startUrl, userData: { depth: 0 } }]);

    try {
        await crawler.run();
        console.log(`CrawlerService: Crawling finished for ${startUrl}. Collected ${collectedData.length} pages.`);
    } catch (error: any) {
        console.error(`CrawlerService: Error during crawling process for ${startUrl}: ${error.message}`, error);
    }

    return collectedData;
  }
}
