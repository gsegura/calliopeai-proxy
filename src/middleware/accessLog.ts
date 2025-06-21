import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';

/**
 * Custom access log middleware for detailed request/response logging
 */

// Define custom tokens for morgan
morgan.token('body', (req: Request) => {
  // Only log body for non-GET requests and limit size
  if (req.method === 'GET') return '';
  
  const body = req.body;
  if (!body || Object.keys(body).length === 0) return '';
  
  const bodyStr = JSON.stringify(body);
  // Truncate long bodies and mask potential secrets
  const truncated = bodyStr.length > 500 ? bodyStr.substring(0, 500) + '...' : bodyStr;
  
  // Mask potential API keys or secrets
  return truncated.replace(/"(api[Kk]ey|secret|token|password)"\s*:\s*"[^"]*"/g, '"$1":"***MASKED***"');
});

morgan.token('user-agent', (req: Request) => {
  return req.get('User-Agent') || 'Unknown';
});

morgan.token('response-time-ms', (req: Request, res: Response) => {
  const responseTime = res.getHeader('X-Response-Time');
  return responseTime ? `${responseTime}ms` : '-';
});

morgan.token('request-id', (req: Request) => {
  // Generate a simple request ID for correlation
  return req.headers['x-request-id'] as string || 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
});

// Custom format for detailed logging
const detailedFormat = [
  '[:date[iso]]',
  ':request-id',
  '":method :url HTTP/:http-version"',
  ':status',
  ':res[content-length]',
  '":referrer"',
  '":user-agent"',
  ':response-time[3]ms',
  ':body'
].join(' ');

// Simplified format for production
const simpleFormat = [
  '[:date[iso]]',
  ':request-id',
  ':method :url',
  ':status',
  ':response-time[3]ms'
].join(' ');

// Color-coded format for development
const devFormat = [
  '[:date[iso]]',
  ':request-id',
  ':method :url',
  ':status',
  ':response-time[3]ms',
  ':body'
].join(' ');

/**
 * Create access log middleware based on environment
 */
export const createAccessLogMiddleware = () => {
  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isDevelopment) {
    // Development: colored output with body logging
    return morgan(devFormat, {
      skip: (req: Request, res: Response) => {
        // Skip health check endpoints in development to reduce noise
        return req.url === '/' || req.url === '/health' || req.url === '/ide/health';
      }
    });
  } else if (isProduction) {
    // Production: simplified logging without body
    return morgan(simpleFormat, {
      skip: (req: Request, res: Response) => {
        // Skip successful health checks in production
        return (req.url === '/' || req.url === '/health' || req.url === '/ide/health') && res.statusCode < 400;
      }
    });
  } else {
    // Default: detailed logging for staging/testing
    return morgan(detailedFormat);
  }
};

/**
 * Response time middleware to track request timing
 * (Response time is already tracked by morgan, this is for internal use)
 */
export const responseTimeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Store start time on request for later use if needed
  (req as any).startTime = startTime;
  
  // Store response time calculation for internal use
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    (res as any).responseTime = responseTime;
  });
  
  next();
};

/**
 * Request ID middleware to add correlation IDs
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || 
    'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
  req.headers['x-request-id'] = requestId;
  
  // Only set header if headers haven't been sent yet
  if (!res.headersSent) {
    res.setHeader('X-Request-ID', requestId);
  }
  
  next();
};

/**
 * Enhanced request logging for debugging
 */
export const debugRequestMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const shouldDebug = process.env.DEBUG_REQUESTS === 'true' || process.env.NODE_ENV === 'development';
  
  if (shouldDebug) {
    console.log('\n--- REQUEST DEBUG ---');
    console.log(`${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
      const body = JSON.stringify(req.body, null, 2);
      // Mask sensitive data
      const maskedBody = body.replace(/"(api[Kk]ey|secret|token|password)"\s*:\s*"[^"]*"/g, '"$1": "***MASKED***"');
      console.log('Body:', maskedBody);
    }
    
    console.log('--- END REQUEST DEBUG ---\n');
  }
  
  next();
};
