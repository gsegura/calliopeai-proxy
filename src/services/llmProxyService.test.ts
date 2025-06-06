import axios, { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { Request } from 'express';
import { getApiKey, proxyLlmRequest } from './llmProxyService';

jest.mock('axios'); // This will auto-mock the default export and other properties like isAxiosError

// The default export of axios is a function, so we cast it to Jest's mock function type
const mockedAxiosCallable = axios as jest.MockedFunction<typeof axios>;

// axios.isAxiosError is a property on the axios object, also mocked
const mockedIsAxiosErrorGuard = axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>;


describe('llmProxyService', () => {
  describe('getApiKey', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it('should return API key if env var exists', () => {
      process.env.TEST_API_KEY = 'testkey123';
      expect(getApiKey('env:TEST_API_KEY')).toBe('testkey123');
    });

    it('should return null if env var does not exist', () => {
      console.error = jest.fn();
      expect(getApiKey('env:NON_EXISTENT_KEY')).toBeNull();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('API key environment variable "NON_EXISTENT_KEY" not found.'));
    });

    it('should return null for undefined apiKeyLocation', () => {
      console.error = jest.fn();
      expect(getApiKey(undefined)).toBeNull();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('API key location is not defined.'));
    });

    it('should return null for empty apiKeyLocation string', () => {
      console.error = jest.fn();
      expect(getApiKey('')).toBeNull();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('API key location is not defined.'));
    });

    it('should return null for unsupported format', () => {
      console.error = jest.fn();
      expect(getApiKey('unsupported:TEST_KEY')).toBeNull();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unsupported API key location format: unsupported:TEST_KEY'));
    });
  });

  describe('proxyLlmRequest', () => {
    let mockRequest: Partial<Request>;
    const originalConsoleError = console.error;

    beforeEach(() => {
      mockedAxiosCallable.mockClear();
      mockedIsAxiosErrorGuard.mockClear();
      console.error = jest.fn();
      mockRequest = {
        method: 'POST',
        body: {
          prompt: 'Hello',
          stream: false,
        },
      };
    });

    afterEach(() => {
        console.error = originalConsoleError;
        // It's good practice to restore if the mock was changed per test,
        // but mockClear in beforeEach is often enough.
        // If a test specifically uses mockImplementationOnce, then restoring is more critical.
        // mockedIsAxiosErrorGuard.mockRestore();
    });


    it('should make a successful POST request and return data', async () => {
      const responseData = { data: 'response data' };
      const responseHeaders = new AxiosHeaders({'content-type': 'application/json'});
      mockedAxiosCallable.mockResolvedValue({ status: 200, data: responseData, headers: responseHeaders, config: { headers: {} as AxiosHeaders } as InternalAxiosRequestConfig });

      const result = await proxyLlmRequest(
        mockRequest as Request,
        'http://downstream.com/api',
        'test-api-key',
        { prompt: 'Hello' }
      );

      expect(mockedAxiosCallable).toHaveBeenCalledWith({
        method: 'POST',
        url: 'http://downstream.com/api',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        data: { prompt: 'Hello' },
        responseType: 'json',
      });
      expect(result.status).toBe(200);
      expect(result.data).toEqual(responseData);
      expect(result.headers).toEqual(responseHeaders);
    });

    it('should handle streaming responseType if req.body.stream is true', async () => {
      mockRequest.body.stream = true;
      const responseData = { data: 'stream data' };
      const responseHeaders = new AxiosHeaders({'content-type': 'text/event-stream'});
      mockedAxiosCallable.mockResolvedValue({ status: 200, data: responseData, headers: responseHeaders, config: { headers: {} as AxiosHeaders } as InternalAxiosRequestConfig });

      await proxyLlmRequest(
        mockRequest as Request,
        'http://downstream.com/api',
        'test-api-key',
        { prompt: 'Hello', stream: true }
      );

      expect(mockedAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({
        responseType: 'stream',
        data: {prompt: 'Hello', stream: true}
      }));
    });

    it('should handle AxiosError with a response and return error details', async () => {
      mockedIsAxiosErrorGuard.mockReturnValue(true);
      const mockConfig = { headers: {} as AxiosHeaders } as InternalAxiosRequestConfig;
      const errorResponse = {
        status: 400,
        data: { error: 'Bad Request' },
        headers: new AxiosHeaders({'x-error-id': 'some-id'}),
        statusText: 'Bad Request',
        config: mockConfig,
      };

      const axiosError = {
        isAxiosError: true, // Keep this for clarity, though guard mock controls flow
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        code: 'ERR_BAD_REQUEST',
        config: mockConfig,
        request: {},
        response: errorResponse,
        toJSON: () => ({}),
      } as unknown as AxiosError;

      mockedAxiosCallable.mockRejectedValue(axiosError);

      const result = await proxyLlmRequest(
        mockRequest as Request,
        'http://downstream.com/api',
        'test-api-key',
        { prompt: 'Hello' }
      );

      expect(result.status).toBe(400);
      expect(result.data).toEqual({ error: 'Bad Request' });
      expect(result.headers).toEqual(errorResponse.headers);
      expect(console.error).toHaveBeenCalledWith('Downstream error response status:', 400);
      expect(console.error).toHaveBeenCalledWith('Downstream error response data:', { error: 'Bad Request' });
    });

    it('should handle AxiosError without a response object (e.g. network error)', async () => {
        mockedIsAxiosErrorGuard.mockReturnValue(true);
        const mockConfig = { headers: {} as AxiosHeaders } as InternalAxiosRequestConfig;
        const axiosError = {
            isAxiosError: true,
            message: 'Network Error',
            name: 'AxiosError',
            code: 'ERR_NETWORK',
            config: mockConfig,
            request: {},
            response: undefined,
            toJSON: () => ({}),
        } as unknown as AxiosError;

        mockedAxiosCallable.mockRejectedValue(axiosError);

        const result = await proxyLlmRequest(
            mockRequest as Request,
            'http://downstream.com/api',
            'test-api-key',
            { prompt: 'Hello' }
        );

        expect(result.status).toBe(500);
        expect(result.data).toEqual({ error: 'Error proxying request', details: 'Network Error' });
        expect(console.error).toHaveBeenCalledWith('Downstream request made but no response received:', {});
    });

    it('should handle non-Axios errors', async () => {
      mockedIsAxiosErrorGuard.mockReturnValue(false);
      const error = new Error('Unexpected error');
      mockedAxiosCallable.mockRejectedValue(error);

      const result = await proxyLlmRequest(
        mockRequest as Request,
        'http://downstream.com/api',
        'test-api-key',
        { prompt: 'Hello' }
      );

      expect(result.status).toBe(500);
      expect(result.data).toEqual({ error: 'Unexpected error during proxying', details: 'Unexpected error' });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`Unexpected error proxying request to http://downstream.com/api:`), error);
    });
  });
});
