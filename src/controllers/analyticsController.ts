import { Request, Response, NextFunction } from 'express';
import { createValidationError } from '../utils/errorUtils';

export interface AnalyticsEvent {
  event: string;
  properties: Record<string, any>;
  uniqueId: string;
}

export const captureAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { workspaceId } = req.params;
    const { event, properties, uniqueId } = req.body as AnalyticsEvent;

    // Validate required fields
    if (!event) {
      throw createValidationError('Missing required parameter: event');
    }

    if (!uniqueId) {
      throw createValidationError('Missing required parameter: uniqueId');
    }

    if (!workspaceId) {
      throw createValidationError('Missing required parameter: workspaceId');
    }

    console.log(`Analytics: Captured event "${event}" for workspace ${workspaceId} from user ${uniqueId}`);
    console.log('Event properties:', JSON.stringify(properties, null, 2));

    // For now, we'll just log the analytics event
    // In a real implementation, you would:
    // 1. Store the event in a database
    // 2. Forward to an analytics service (e.g., PostHog, Mixpanel, etc.)
    // 3. Apply any data transformations or enrichment
    
    // TODO: Implement actual analytics storage/forwarding
    // Example implementations could include:
    // - await analyticsService.capture({ event, properties, uniqueId, workspaceId });
    // - await database.insertAnalyticsEvent({ event, properties, uniqueId, workspaceId, timestamp: new Date() });

    // Return success with empty body as per API spec
    res.status(200).json({});

  } catch (error: any) {
    console.error(`Error capturing analytics event: ${error.message}`, error);
    next(error); // Forward to global error handler
  }
};
