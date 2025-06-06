import { PlaywrightCrawler, log, PlaywrightCrawlingContext, EnqueueLinksOptions } from 'crawlee';
import { Page } from 'playwright';
import axios from 'axios';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from 'langchain/document';

// Suppress non-error logs for cleaner output during normal operation
log.setLevel(log.LEVELS.ERROR);

export interface CrawledData {
  url: string;
  path: string;
  title?: string;
  bodySnippet?: string;
  markdownContent?: string; // Added markdownContent field
  error?: string;
}

export interface CrawlerOptions {
  startUrl: string;
  maxDepth: number;
  maxRequests: number;
}

export class CrawlerService {
  private vectorStore?: MemoryVectorStore;
  private embeddings?: OpenAIEmbeddings;

  constructor() {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn('OPENAI_API_KEY is not set. Vector store will not be initialized. Crawled data will not be added to embeddings.');
      // Depending on strictness, you might throw an error here:
      // throw new Error('OPENAI_API_KEY is not set. Cannot initialize CrawlerService.');
    } else {
      try {
        this.embeddings = new OpenAIEmbeddings({ openAIApiKey: openaiApiKey });
        this.vectorStore = new MemoryVectorStore(this.embeddings);
        console.log('CrawlerService: OpenAIEmbeddings and MemoryVectorStore initialized successfully.');
      } catch (error: any) {
        console.error('CrawlerService: Failed to initialize OpenAIEmbeddings or MemoryVectorStore:', error.message);
        // Decide if you want to clear them if partially initialized or let them be undefined
        this.embeddings = undefined;
        this.vectorStore = undefined;
      }
    }
  }

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
        const htmlContent = await page.content(); // Get HTML content

        const bodyText = await page.evaluate(() => document.body.innerText);
        const bodySnippet = bodyText.substring(0, 1000).replace(/\s\s+/g, ' ').trim();

        let markdownContent: string | undefined;
        let fetchError: string | undefined;

        try {
          // Make POST request to Markitdown service
          const markitdownServiceUrl = process.env.MARKITDOWN_SERVICE_URL || 'http://markitdown:8080';
          log.info(`Sending content of ${url} to Markitdown service at ${markitdownServiceUrl}`);
          const response = await axios.post(markitdownServiceUrl, htmlContent, {
            headers: { 'Content-Type': 'text/html' },
            timeout: 30000, // 30 seconds timeout
          });
          markdownContent = response.data;
          log.info(`Successfully converted HTML to Markdown for ${url}`);
        } catch (error: any) {
          log.error(`Error calling Markitdown service for ${url}: ${error.message}`);
          fetchError = `Failed to convert HTML to Markdown: ${error.message}`;
        }

        const pageData: CrawledData = { url, path, title, bodySnippet, markdownContent, error: fetchError };
        collectedData.push(pageData);

        // Add to vector store if markdownContent is available and vectorStore is initialized
        if (this.vectorStore && markdownContent) {
          try {
            const doc = new Document({ pageContent: markdownContent, metadata: { url, title, path } });
            await this.vectorStore.addDocuments([doc]);
            log.info(`Added content from ${url} to vector store.`);
          } catch (error: any) {
            log.error(`Error adding document to vector store for ${url}: ${error.message}`);
            // Optionally, update pageData.error or add a specific vector store error field
            if (pageData.error) {
              pageData.error += `; Failed to add to vector store: ${error.message}`;
            } else {
              pageData.error = `Failed to add to vector store: ${error.message}`;
            }
          }
        } else if (!this.vectorStore) {
          console.warn(`Vector store not initialized. Skipping adding content from ${url} to vector store.`);
        }


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
        // Ensure collectedData is defined in this scope or passed correctly
        // If an error occurs with Markitdown, it's handled in requestHandler.
        // This handler is for Playwright navigation/request errors.
        const errorData: CrawledData = {
          url: request.url,
          path: new URL(request.url).pathname,
          error: `Failed to crawl: ${errorMessage}`, // This error is specific to crawling
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

  // Example method to allow searching the vector store
  public async searchSimilarDocuments(query: string, k: number = 5) {
    if (!this.vectorStore) {
      console.warn('Search attempted but vector store is not initialized.');
      return [];
    }
    try {
      const results = await this.vectorStore.similaritySearch(query, k);
      console.log(`Found ${results.length} similar documents for query: "${query}"`);
      return results;
    } catch (error: any) {
      console.error('Error during similarity search:', error.message);
      return [];
    }
  }
}
