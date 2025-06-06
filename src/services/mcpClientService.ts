import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { log } from 'crawlee';

/**
 * Service for interacting with MCP-compatible services
 */
export class MCPClientService {
  private static instances: Map<string, MCPClientService> = new Map();
  private client: Client | undefined;
  private serviceUrl: string;
  private isConnected: boolean = false;

  /**
   * Get or create an instance of MCPClientService for a specific service URL
   * This implements a singleton pattern per service URL
   */
  public static getInstance(serviceUrl: string): MCPClientService {
    if (!this.instances.has(serviceUrl)) {
      this.instances.set(serviceUrl, new MCPClientService(serviceUrl));
    }
    return this.instances.get(serviceUrl)!;
  }

  /**
   * Create a new MCP client service
   * @param serviceUrl - The URL of the MCP service
   */
  private constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl;
  }

  /**
   * Connect to the MCP service
   * Tries StreamableHTTP first, then falls back to SSE if needed
   */
  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return; // Already connected
    }

    try {
      // First try with StreamableHTTP transport
      this.client = new Client({
        name: 'mcp-client-service',
        version: '1.0.0'
      });
      const transport = new StreamableHTTPClientTransport(new URL(this.serviceUrl));
      await this.client.connect(transport);
      this.isConnected = true;
      log.info(`Connected to MCP service at ${this.serviceUrl} using Streamable HTTP transport`);
    } catch (error) {
      // If that fails, try with SSE transport as fallback
      log.info(`Streamable HTTP connection failed for ${this.serviceUrl}, falling back to SSE transport`);
      this.client = new Client({
        name: 'mcp-client-service',
        version: '1.0.0'
      });
      const sseTransport = new SSEClientTransport(new URL(this.serviceUrl));
      await this.client.connect(sseTransport);
      this.isConnected = true;
      log.info(`Connected to MCP service at ${this.serviceUrl} using SSE transport`);
    }
  }

  /**
   * Call a tool on the MCP service
   * @param toolName - The name of the tool to call
   * @param args - The arguments to pass to the tool
   * @returns The result of the tool call
   */
  public async callTool<T = any>(toolName: string, args: Record<string, any>): Promise<T> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error(`Failed to connect to MCP service at ${this.serviceUrl}`);
    }

    const result = await this.client.callTool({
      name: toolName,
      arguments: args
    });

    // Extract the result based on the response structure
    if (result && typeof result === 'object' && 'result' in result) {
      return result.result as T;
    }
    
    return result as T;
  }

  /**
   * Disconnect from the MCP service
   */
  public disconnect(): void {
    this.client = undefined;
    this.isConnected = false;
  }
}
