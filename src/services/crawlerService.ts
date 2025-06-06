import { PlaywrightCrawler, log, PlaywrightCrawlingContext, EnqueueLinksOptions } from 'crawlee';
import { Page } from 'playwright';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from 'langchain/document';
import { Embeddings } from '@langchain/core/embeddings';
import { MCPClientService } from './mcpClientService';

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
  private embeddings?: Embeddings; // Changed to base Embeddings type

  constructor() {
    const embeddingProvider = process.env.EMBEDDINGS_PROVIDER?.toLowerCase() || 'openai';
    let initialized = false;

    log.info(`CrawlerService: Attempting to initialize embeddings with provider: ${embeddingProvider}`);

    try {
      if (embeddingProvider === 'openai') {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
          console.warn('OPENAI_API_KEY is not set. OpenAI embeddings will not be initialized.');
        } else {
          this.embeddings = new OpenAIEmbeddings({ openAIApiKey: openaiApiKey });
          console.log('CrawlerService: OpenAIEmbeddings initialized successfully.');
          initialized = true;
        }
      } else if (embeddingProvider === 'ollama') {
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL; // e.g., http://localhost:11434
        const ollamaModel = process.env.OLLAMA_EMBEDDING_MODEL; // e.g., nomic-embed-text

        const ollamaParams: { baseUrl?: string; model?: string } = {};
        if (ollamaBaseUrl) ollamaParams.baseUrl = ollamaBaseUrl;
        if (ollamaModel) ollamaParams.model = ollamaModel;

        this.embeddings = new OllamaEmbeddings(ollamaParams);
        console.log(`CrawlerService: OllamaEmbeddings initialized successfully (Model: ${ollamaModel || 'default'}, BaseURL: ${ollamaBaseUrl || 'default'}).`);
        initialized = true;
      } else {
        console.warn(`CrawlerService: Unknown EMBEDDINGS_PROVIDER "${embeddingProvider}". Vector store will not be initialized.`);
      }

      if (initialized && this.embeddings) {
        this.vectorStore = new MemoryVectorStore(this.embeddings);
        console.log('CrawlerService: MemoryVectorStore initialized successfully with the chosen embedding provider.');
      } else if (initialized && !this.embeddings) {
        // This case should ideally not be hit if logic is correct, but as a safeguard:
        console.warn('CrawlerService: Embeddings provider was recognized, but embeddings object was not created. Vector store not initialized.');
      } else {
        // This covers cases where provider is unknown or required keys (like OpenAI API key) are missing.
        console.warn('CrawlerService: Embeddings not initialized. Vector store will not be initialized. Crawled data will not be added to embeddings.');
      }
    } catch (error: any) {
      console.error(`CrawlerService: Failed to initialize embeddings or MemoryVectorStore with provider ${embeddingProvider}:`, error.message);
      this.embeddings = undefined;
      this.vectorStore = undefined;
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
          // Get markitdown service URL from environment or use default
          const markitdownServiceUrl = process.env.MARKITDOWN_SERVICE_URL || 'http://markitdown:8080/mcp';
          log.info(`Sending content of ${url} to Markitdown MCP service at ${markitdownServiceUrl}`);
          
          // Use the MCPClientService to call the convert_to_markdown tool
          const mcpClient = MCPClientService.getInstance(markitdownServiceUrl);
          await mcpClient.connect();
          
          markdownContent = await mcpClient.callTool<string>('convert_to_markdown', {
            html: htmlContent
          });
          
          log.info(`Successfully converted HTML to Markdown for ${url}`);
        } catch (error: any) {
          log.error(`Error calling Markitdown MCP service for ${url}: ${error.message}`);
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
