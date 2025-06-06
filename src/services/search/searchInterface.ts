/**
 * Interface definitions for search service providers
 */

export interface SearchResult {
  title?: string;
  link?: string;
  snippet?: string;
  [key: string]: any; // Allow for additional provider-specific fields
}

export interface SearchOptions {
  maxResults?: number;
  topic?: string;
  timeRange?: string;
  includeImages?: boolean;
  [key: string]: any; // Allow for additional provider-specific options
}

export interface SearchServiceProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  getName(): string;
}
