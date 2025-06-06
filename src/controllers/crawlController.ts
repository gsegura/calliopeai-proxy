import { Request, Response } from 'express';
import { CheerioCrawler, Configuration, Dataset, log } from 'crawlee';

// Suppress non-error logs for cleaner output during normal operation
log.setLevel(log.LEVELS.ERROR);

interface CrawledData {
  url: string;
  path: string;
  title?: string;
  bodySnippet?: string;
  error?: string;
}

export const crawlWebsite = async (req: Request, res: Response) => {
  const { startUrl, maxDepth, limit } = req.body;

  if (!startUrl) {
    return res.status(400).json({ error: 'Missing required parameter: startUrl' });
  }

  const maxRequestsToCrawl = limit ? parseInt(limit as string, 10) : 50; // Default limit
  const maximumCrawlDepth = maxDepth ? parseInt(maxDepth as string, 10) : 2; // Default depth

  console.log(`Received crawl request for startUrl: "${startUrl}", maxDepth: ${maximumCrawlDepth}, limit: ${maxRequestsToCrawl}`);

  const collectedData: CrawledData[] = [];
  const dataset = await Dataset.open(`crawl-${Date.now()}`); // Store data in a dataset

  try {
    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: maxRequestsToCrawl,
      maxRequests: maxRequestsToCrawl, // Ensure the crawler respects the limit
      minConcurrency: 1,
      maxConcurrency: 5,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 60, // Increased timeout for potentially slow pages
      navigationTimeoutSecs: 60, // Increased timeout for navigation

      requestHandler: async ({ request, $, body }) => {
        const currentDepth = request.userData.depth || 0;
        if (currentDepth > maximumCrawlDepth) {
          log.info(`Skipping ${request.url} due to depth: ${currentDepth} > ${maximumCrawlDepth}`);
          return;
        }

        log.info(`Processing ${request.url} at depth ${currentDepth}...`);
        const title = $('title').text();
        const url = request.loadedUrl || request.url; // Use loadedUrl if available (after redirects)
        const path = new URL(url).pathname;

        // Simple body text snippet
        const bodySnippet = $('body').text().substring(0, 1000).replace(/\s\s+/g, ' ').trim();

        const pageData: CrawledData = { url, path, title, bodySnippet };
        await dataset.pushData(pageData); // Push to dataset
        collectedData.push(pageData); // Also keep in memory for current response

        // Enqueue links for next depth
        if (currentDepth < maximumCrawlDepth) {
          // Selectors for links to enqueue - can be made more specific
          const links = $('a[href]')
            .map((_i, el) => $(el).attr('href'))
            .get()
            .filter(href => href && (href.startsWith('http') || href.startsWith('/')));

          for (const link of links) {
            try {
              const absoluteUrl = new URL(link, request.loadedUrl || request.url).toString();
              if (collectedData.length + crawler.requestQueue.pendingRequestCount() < maxRequestsToCrawl) {
                 if (request.userData.depth !== undefined) { // Ensure depth is defined
                    await crawler.addRequests([{
                        url: absoluteUrl,
                        userData: { depth: currentDepth + 1 }
                    }]);
                 }
              } else {
                log.info('Request limit reached, not enqueuing further links.');
                break;
              }
            } catch (e) {
              log.debug(`Invalid URL found: ${link} on page ${request.url}`);
            }
          }
        }
      },

      failedRequestHandler: async ({ request, error }) => {
        log.error(`Failed to crawl ${request.url}: ${error.message}`);
        const errorData: CrawledData = {
          url: request.url,
          path: new URL(request.url).pathname,
          error: `Failed to crawl: ${error.message}`,
        };
        await dataset.pushData(errorData);
        collectedData.push(errorData);
      },
    });

    await crawler.addRequests([{ url: startUrl, userData: { depth: 0 } }]);
    await crawler.run();

    console.log(`Crawling finished for ${startUrl}. Collected ${collectedData.length} pages.`);
    res.status(200).json({
      message: 'Crawling completed.',
      startUrl,
      maxDepth: maximumCrawlDepth,
      limit: maxRequestsToCrawl,
      resultsCount: collectedData.length,
      data: collectedData, // Send data collected in memory
      // dataFromDataset: await dataset.getData(), // Optionally send data from dataset
    });

  } catch (error: any) {
    console.error(`Error during crawling process for ${startUrl}: ${error.message}`, error);
    res.status(500).json({
      error: 'Crawling failed.',
      message: error.message,
      startUrl,
    });
  } finally {
    await dataset.drop(); // Clean up dataset after use for this request
  }
};
