/**
 * Interface definitions for search service providers
 */

export interface ContextItem {
  content: string;
  name: string; // maps to title
  description: string; // maps to snippet
  editing?: boolean;
  editable?: boolean;
  icon?: string;
  uri?: string; // or ContextItemUri if defined as an interface
  hidden?: boolean;
  status?: string;
}

export interface SearchOptions {
  maxResults?: number;
  topic?: string;
  timeRange?: string;
  includeImages?: boolean;
  [key: string]: any; // Allow for additional provider-specific options
}

export interface SearchServiceProvider {
  search(query: string, options?: SearchOptions): Promise<ContextItem[]>;
  getName(): string;
}
