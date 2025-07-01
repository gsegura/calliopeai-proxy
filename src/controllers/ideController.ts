import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '../services/configService';
import { FQSN } from '../interfaces/storage';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    slug: string;
    email: string;
  };
}

/**
 * Controller for Continue.dev IDE endpoints
 */
export class IdeController {
  private configService: ConfigService;

  constructor() {
    this.configService = ConfigService.getInstance();
  }

  /**
   * POST /ide/sync-secrets
   * Resolves Fully Qualified Secret Names (FQSNs) to their actual values or secret locations
   */
  public syncSecrets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fqsns, orgScopeId } = req.body as { fqsns: FQSN[]; orgScopeId: string | null };

      if (!fqsns || !Array.isArray(fqsns)) {
        res.status(400).json({ error: 'Missing or invalid fqsns array' });
        return;
      }

      // Validate FQSN structure
      for (const fqsn of fqsns) {
        if (!fqsn.ownerSlug || !fqsn.packageSlug || !fqsn.secretName) {
          res.status(400).json({ 
            error: 'Invalid FQSN structure. Each FQSN must have ownerSlug, packageSlug, and secretName',
            invalidFqsn: fqsn
          });
          return;
        }
      }

      const storage = this.configService.getStorage();
      const results = await storage.resolveSecrets(fqsns, orgScopeId);

      res.status(200).json(results);
    } catch (error: any) {
      console.error('Error in syncSecrets:', error);
      next(error);
    }
  };

  /**
   * GET /ide/list-assistants
   * Returns complete list of assistants available to the user
   */
  public listAssistants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, alwaysUseProxy } = req.query as { 
        organizationId?: string; 
        alwaysUseProxy?: string;
      };

      const useProxy = alwaysUseProxy === 'true';
      const storage = this.configService.getStorage();
      
      const assistants = await storage.listAssistants(organizationId || null, useProxy);

      // Post-process assistants to ensure correct format for the extension
      for (const assistant of assistants) {
        if (assistant.configResult.config?.models) {
          for (const model of assistant.configResult.config.models) {
            if (model.provider === 'calliope-proxy' && typeof model.apiKey === 'string') {
              // Handle encoded secret locations
              if (model.apiKey.includes(':')) {
                // This is an encoded secret location
                model.apiKeyLocation = model.apiKey;
                
                // Set orgScopeId based on secret type and context
                if (model.apiKey.startsWith('organization:') && organizationId) {
                  model.orgScopeId = organizationId;
                } else if (model.apiKey.startsWith('free_trial:') && organizationId) {
                  model.orgScopeId = organizationId;
                } else if (model.apiKey.startsWith('models_add_on:') && organizationId) {
                  model.orgScopeId = organizationId;
                }
              }
            }
          }
        }
      }

      res.status(200).json(assistants);
    } catch (error: any) {
      console.error('Error in listAssistants:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ message: 'User not found' });
      } else {
        next(error);
      }
    }
  };

  /**
   * GET /ide/list-organizations
   * Returns list of organizations the authenticated user has access to
   */
  public listOrganizations = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id; // From auth middleware
      const storage = this.configService.getStorage();
      
      const organizations = await storage.listOrganizations(userId);

      res.status(200).json({ organizations });
    } catch (error: any) {
      console.error('Error in listOrganizations:', error);
      next(error);
    }
  };

  /**
   * GET /ide/list-assistant-full-slugs
   * Returns lightweight list of assistant identifiers for efficient change detection
   */
  public listAssistantFullSlugs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = req.query as { organizationId?: string };

      const storage = this.configService.getStorage();
      const fullSlugs = await storage.listAssistantFullSlugs(organizationId || null);

      res.status(200).json({ fullSlugs });
    } catch (error: any) {
      console.error('Error in listAssistantFullSlugs:', error);
      next(error);
    }
  };

  /**
   * GET /ide/free-trial-status
   * Returns current free trial usage status and limits for the authenticated user
   */
  public getFreeTrialStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id; // From auth middleware
      const storage = this.configService.getStorage();
      
      const status = await storage.getFreeTrialStatus(userId);

      res.status(200).json(status);
    } catch (error: any) {
      console.error('Error in getFreeTrialStatus:', error);
      next(error);
    }
  };

  /**
   * POST /ide/update-free-trial-usage
   * Updates free trial usage counters (internal endpoint)
   */
  public updateFreeTrialUsage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { chatIncrement, autocompleteIncrement } = req.body as { 
        chatIncrement?: number; 
        autocompleteIncrement?: number;
      };

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const storage = this.configService.getStorage();
      await storage.updateFreeTrialUsage(userId, chatIncrement, autocompleteIncrement);

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error in updateFreeTrialUsage:', error);
      next(error);
    }
  };

  /**
   * GET /ide/health
   * Health check endpoint for IDE platform services
   */
  public health = async (req: Request, res: Response): Promise<void> => {
    try {
      const config = this.configService.getConfig();
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        stats: {
          users: config.users.length,
          organizations: config.organizations.length,
          assistants: config.assistants.length
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Configuration service not available'
      });
    }
  };
}
