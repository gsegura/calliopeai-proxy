import { MCPClientService } from './mcpClientService';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Mock the MCP SDK modules
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');
jest.mock('@modelcontextprotocol/sdk/client/sse.js');

describe('MCPClientService', () => {
  // Set up mocks
  const mockCallTool = jest.fn();
  const mockConnect = jest.fn();
  const mockClientInstance = {
    callTool: mockCallTool,
    connect: mockConnect
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock the Client constructor
    (Client as jest.Mock).mockImplementation(() => mockClientInstance);
  });

  afterEach(() => {
    // Clear all instances between tests
    // @ts-ignore - accessing private property for testing
    MCPClientService.instances = new Map();
  });

  it('should create a singleton instance per service URL', () => {
    const instance1 = MCPClientService.getInstance('http://service1:8080');
    const instance2 = MCPClientService.getInstance('http://service1:8080');
    const instance3 = MCPClientService.getInstance('http://service2:8080');

    expect(instance1).toBe(instance2); // Same URL = same instance
    expect(instance1).not.toBe(instance3); // Different URL = different instance
  });

  it('should try StreamableHTTP transport first', async () => {
    const serviceUrl = 'http://test-service:8080';
    const mcpClient = MCPClientService.getInstance(serviceUrl);
    
    mockConnect.mockResolvedValueOnce(undefined);
    
    await mcpClient.connect();
    
    expect(Client).toHaveBeenCalledTimes(1);
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(expect.any(URL));
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(SSEClientTransport).not.toHaveBeenCalled();
  });

  it('should fall back to SSE transport if StreamableHTTP fails', async () => {
    const serviceUrl = 'http://test-service:8080';
    const mcpClient = MCPClientService.getInstance(serviceUrl);
    
    mockConnect.mockRejectedValueOnce(new Error('StreamableHTTP failed'))
               .mockResolvedValueOnce(undefined);
    
    await mcpClient.connect();
    
    expect(Client).toHaveBeenCalledTimes(2);
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(expect.any(URL));
    expect(SSEClientTransport).toHaveBeenCalledWith(expect.any(URL));
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('should call a tool after connecting', async () => {
    const serviceUrl = 'http://test-service:8080';
    const mcpClient = MCPClientService.getInstance(serviceUrl);
    
    mockConnect.mockResolvedValueOnce(undefined);
    mockCallTool.mockResolvedValueOnce({ result: 'test result' });
    
    const result = await mcpClient.callTool('test-tool', { arg: 'value' });
    
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'test-tool',
      arguments: { arg: 'value' }
    });
    expect(result).toBe('test result');
  });

  it('should handle direct result format without result property', async () => {
    const serviceUrl = 'http://test-service:8080';
    const mcpClient = MCPClientService.getInstance(serviceUrl);
    
    mockConnect.mockResolvedValueOnce(undefined);
    mockCallTool.mockResolvedValueOnce('direct result');
    
    const result = await mcpClient.callTool('test-tool', { arg: 'value' });
    
    expect(result).toBe('direct result');
  });

  it('should reuse existing connection for subsequent tool calls', async () => {
    const serviceUrl = 'http://test-service:8080';
    const mcpClient = MCPClientService.getInstance(serviceUrl);
    
    mockConnect.mockResolvedValueOnce(undefined);
    mockCallTool.mockResolvedValue({ result: 'test result' });
    
    await mcpClient.callTool('test-tool', { arg1: 'value1' });
    await mcpClient.callTool('test-tool', { arg2: 'value2' });
    
    // Connect should only be called once
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledTimes(2);
  });

  it('should throw an error if connection fails', async () => {
    const serviceUrl = 'http://test-service:8080';
    const mcpClient = MCPClientService.getInstance(serviceUrl);
    
    // Both transports fail
    mockConnect.mockRejectedValue(new Error('StreamableHTTP failed'))
               .mockRejectedValue(new Error('SSE failed'));
    
    await expect(mcpClient.callTool('test-tool', { arg: 'value' }))
      .rejects.toThrow();
  });
});
