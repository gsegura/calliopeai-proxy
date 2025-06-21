import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

// Initialize dotenv to load .env file (if it exists)
dotenv.config();

import apiRoutes from './routes/apiRoutes';
import modelProxyRoutes from './routes/modelProxyRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import ideRoutes from './routes/ideRoutes';
import { globalErrorHandler } from './middleware/errorHandler';
import { ConfigService } from './services/configService';
import { 
  createAccessLogMiddleware, 
  responseTimeMiddleware, 
  requestIdMiddleware, 
  debugRequestMiddleware 
} from './middleware/accessLog';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Initialize configuration service
const initializeApp = async () => {
  try {
    const configService = ConfigService.getInstance();
    await configService.initialize();
    console.log('Configuration service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize configuration service:', error);
    process.exit(1);
  }
};

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request tracking and logging middleware
app.use(requestIdMiddleware); // Add request IDs for correlation
app.use(responseTimeMiddleware); // Track response times
app.use(createAccessLogMiddleware()); // HTTP access logging

// Debug middleware (only active in development or when DEBUG_REQUESTS=true)
app.use(debugRequestMiddleware);


// Mount Routers
app.use('/api', apiRoutes);
app.use('/model-proxy/v1', modelProxyRoutes);
app.use('/proxy', analyticsRoutes);
app.use('/ide', ideRoutes);


// Simple health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Server is running and healthy!' });
});

// Global Error Handler - should be the last piece of middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  globalErrorHandler(err, req, res, next);
});

// Initialize and start the server
initializeApp().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access health check at http://localhost:${PORT}/`);
    console.log('Mounted routes:');
    console.log(`  /api/web (POST)`);
    console.log(`  /api/crawl (POST)`);
    console.log(`  /model-proxy/v1/chat/completions (POST)`);
    console.log(`  /model-proxy/v1/completions (POST)`);
    console.log(`  /model-proxy/v1/embeddings (POST)`);
    console.log(`  /model-proxy/v1/rerank (POST)`);
    console.log(`  /proxy/analytics/:workspaceId/capture (POST)`);
    console.log(`  /ide/sync-secrets (POST)`);
    console.log(`  /ide/list-assistants (GET)`);
    console.log(`  /ide/list-organizations (GET)`);
    console.log(`  /ide/list-assistant-full-slugs (GET)`);
    console.log(`  /ide/free-trial-status (GET)`);
    console.log(`  /ide/health (GET)`);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error('Reason:', reason.name, reason.message);
  console.error('Stack:', reason.stack);
  // Optionally, close server gracefully then exit
  // server.close(() => {
  //   process.exit(1);
  // });
  process.exit(1); // Exit immediately (can be improved with graceful shutdown)
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error('Error:', err.name, err.message);
  console.error('Stack:', err.stack);
  // Optionally, close server gracefully then exit
  process.exit(1); // Exit immediately
});
