import { NextFunction, Request, Response } from 'express';
import { CrawlerService, CrawledData, CrawlerOptions } from '../services/crawlerService'; // Import new service and types
import { log } from 'crawlee'; // Keep crawlee log for consistency if used elsewhere, or remove if not needed

// Suppress non-error logs for cleaner output - this might be duplicative if service also does it.
// Consider centralizing log level config if necessary. For now, keep it to ensure controller-level logs are also filtered.
log.setLevel(log.LEVELS.ERROR);

export const crawlWebsite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { startUrl, maxDepth, limit } = req.body;

  if (!startUrl) {
    res.status(400).json({ error: 'Missing required parameter: startUrl' });
    return;
  }

  const maxRequestsToCrawl = limit ? parseInt(limit as string, 10) : 50; // Default limit
  const maximumCrawlDepth = maxDepth ? parseInt(maxDepth as string, 10) : 2; // Default depth

  console.log(`crawlController: Received crawl request for startUrl: "${startUrl}", maxDepth: ${maximumCrawlDepth}, limit: ${maxRequestsToCrawl}`);

  const crawlerService = new CrawlerService();
  const crawlerOptions: CrawlerOptions = {
    startUrl,
    maxDepth: maximumCrawlDepth,
    maxRequests: maxRequestsToCrawl,
  };

  try {
    const collectedData: CrawledData[] = await crawlerService.launchCrawl(crawlerOptions);

    console.log(`crawlController: Crawling finished for ${startUrl}. Collected ${collectedData.length} pages.`);
    res.status(200).json({
      message: 'Crawling completed.',
      startUrl,
      maxDepth: maximumCrawlDepth,
      limit: maxRequestsToCrawl,
      resultsCount: collectedData.length,
      data: collectedData,
    });

  } catch (error: any) {
    console.error(`crawlController: Error during crawling process for ${startUrl}: ${error.message}`, error);
    // Pass the error to the centralized error handler if you have one, or return a generic error
    // For now, mirroring the previous behavior:
    res.status(500).json({
      error: 'Crawling failed.',
      message: error.message, // It's often better to not expose raw error messages to clients
      startUrl,
    });
    // If you have a global error handler middleware, you might prefer:
    // next(error);
  }
};
