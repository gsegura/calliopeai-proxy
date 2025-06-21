import { 
  IStorage, 
  FQSN, 
  SecretResult, 
  SecretLocation, 
  AssistantInfo, 
  OrganizationDescription, 
  FreeTrialStatus, 
  FullSlug 
} from '../interfaces/storage';
import { 
  ProxyConfig, 
  UserConfig, 
  OrganizationConfig, 
  AssistantConfig, 
  FreeTrialUsage 
} from '../interfaces/config';

/**
 * In-memory storage implementation for Continue.dev platform data
 * Loads configuration from YAML and provides all required operations
 */
export class InMemoryStorage implements IStorage {
  private config: ProxyConfig;
  private freeTrialUsage: Map<string, FreeTrialUsage> = new Map();

  constructor(config: ProxyConfig) {
    this.config = config;
    this.initializeFreeTrialUsage();
  }

  private initializeFreeTrialUsage(): void {
    // Initialize free trial usage for all users
    for (const user of this.config.users) {
      this.freeTrialUsage.set(user.id, {
        userId: user.id,
        optedInToFreeTrial: this.config.freeTrialSettings.defaultOptIn,
        chatCount: 0,
        autocompleteCount: 0,
        lastResetDate: new Date().toISOString()
      });
    }
  }

  async resolveSecrets(fqsns: FQSN[], orgScopeId: string | null): Promise<(SecretResult | undefined)[]> {
    const results: (SecretResult | undefined)[] = [];

    for (const fqsn of fqsns) {
      const result = await this.resolveSingleSecret(fqsn, orgScopeId);
      results.push(result);
    }

    return results;
  }

  private async resolveSingleSecret(fqsn: FQSN, orgScopeId: string | null): Promise<SecretResult | undefined> {
    // Implementation of Continue Hub's secret resolution hierarchy
    // Priority order depends on organization type and scope

    const organization = orgScopeId ? this.findOrganizationBySlug(orgScopeId) : null;
    
    if (organization) {
      // For organizations, follow the hierarchy based on tier
      if (organization.tier === 'solo') {
        // Solo: Models Add-On → User Secrets → Free Trial
        return this.resolveSecretHierarchy(fqsn, [
          () => this.resolveModelsAddOnSecret(fqsn),
          () => this.resolveUserSecret(fqsn),
          () => this.resolveFreeTrialSecret(fqsn)
        ]);
      } else {
        // Teams/Enterprise: Org Models Add-On → Org Secrets → User Secrets
        return this.resolveSecretHierarchy(fqsn, [
          () => this.resolveModelsAddOnSecret(fqsn),
          () => this.resolveOrganizationSecret(fqsn, organization.slug),
          () => this.resolveUserSecret(fqsn)
        ]);
      }
    } else {
      // Personal workspace: User Secrets → Free Trial
      return this.resolveSecretHierarchy(fqsn, [
        () => this.resolveUserSecret(fqsn),
        () => this.resolveFreeTrialSecret(fqsn)
      ]);
    }
  }

  private async resolveSecretHierarchy(
    fqsn: FQSN, 
    resolvers: (() => Promise<SecretResult | undefined>)[]
  ): Promise<SecretResult | undefined> {
    for (const resolver of resolvers) {
      const result = await resolver();
      if (result) {
        return result;
      }
    }
    return undefined;
  }

  private async resolveUserSecret(fqsn: FQSN): Promise<SecretResult | undefined> {
    const userSecrets = this.config.secrets.user[fqsn.ownerSlug];
    if (userSecrets && userSecrets.secrets[fqsn.secretName]) {
      return {
        fqsn,
        value: userSecrets.secrets[fqsn.secretName] // User secrets return value directly
      };
    }
    return undefined;
  }

  private async resolveOrganizationSecret(fqsn: FQSN, orgSlug: string): Promise<SecretResult | undefined> {
    const orgSecrets = this.config.secrets.organization[orgSlug];
    if (orgSecrets && orgSecrets.secrets[fqsn.secretName]) {
      return {
        fqsn,
        // Org secrets return location only, not the actual value
        secretLocation: {
          secretType: 'organization',
          orgSlug,
          secretName: fqsn.secretName
        }
      };
    }
    return undefined;
  }

  private async resolveModelsAddOnSecret(fqsn: FQSN): Promise<SecretResult | undefined> {
    // Check if there's a models add-on block that provides this secret
    for (const [blockSlug, modelsAddOn] of Object.entries(this.config.secrets.modelsAddOn)) {
      if (modelsAddOn.secrets[fqsn.secretName]) {
        return {
          fqsn,
          secretLocation: {
            secretType: 'models_add_on',
            blockSlug,
            secretName: fqsn.secretName
          }
        };
      }
    }
    return undefined;
  }

  private async resolveFreeTrialSecret(fqsn: FQSN): Promise<SecretResult | undefined> {
    // Check if there's a free trial block that provides this secret
    for (const [blockSlug, freeTrial] of Object.entries(this.config.secrets.freeTrial)) {
      if (freeTrial.secrets[fqsn.secretName]) {
        return {
          fqsn,
          secretLocation: {
            secretType: 'free_trial',
            blockSlug,
            secretName: fqsn.secretName
          }
        };
      }
    }
    return undefined;
  }

  async listAssistants(organizationId?: string | null, alwaysUseProxy?: boolean): Promise<AssistantInfo[]> {
    let assistants = this.config.assistants;

    // Filter by organization if specified
    if (organizationId) {
      const org = this.findOrganizationById(organizationId);
      if (org) {
        assistants = assistants.filter(assistant => assistant.ownerSlug === org.slug);
      } else {
        return []; // Organization not found
      }
    }

    // Convert to AssistantInfo format
    const assistantInfos: AssistantInfo[] = [];
    for (const assistant of assistants) {
      const assistantInfo: AssistantInfo = {
        configResult: {
          config: assistant.config,
          configLoadInterrupted: false,
          errors: null
        },
        ownerSlug: assistant.ownerSlug,
        packageSlug: assistant.packageSlug,
        iconUrl: assistant.iconUrl || null,
        rawYaml: assistant.rawYaml,
        onPremProxyUrl: assistant.onPremProxyUrl || null,
        useOnPremProxy: alwaysUseProxy || assistant.useOnPremProxy || false
      };

      // Process template variables in the configuration
      assistantInfo.configResult.config = await this.processTemplateVariables(
        assistant.config, 
        organizationId
      );

      assistantInfos.push(assistantInfo);
    }

    return assistantInfos;
  }

  private async processTemplateVariables(config: any, orgScopeId?: string | null): Promise<any> {
    // Deep clone the config to avoid modifying the original
    const processedConfig = JSON.parse(JSON.stringify(config));
    
    // Process template variables like ${{ secrets.user123/my-assistant@OPENAI_API_KEY }}
    const processValue = async (value: any): Promise<any> => {
      if (typeof value === 'string' && value.includes('${{')) {
        // Extract template variables and resolve them
        const templateRegex = /\$\{\{\s*secrets\.([^/]+)\/([^@]+)@([^}]+)\s*\}\}/g;
        let processedValue = value;
        let match;
        
        while ((match = templateRegex.exec(value)) !== null) {
          const [fullMatch, ownerSlug, packageSlug, secretName] = match;
          const fqsn: FQSN = { ownerSlug, packageSlug, secretName };
          
          const secretResult = await this.resolveSingleSecret(fqsn, orgScopeId || null);
          if (secretResult?.value) {
            processedValue = processedValue.replace(fullMatch, secretResult.value);
          } else if (secretResult?.secretLocation) {
            // For org secrets, we might want to leave a placeholder or handle differently
            processedValue = processedValue.replace(fullMatch, `[SECRET:${secretName}]`);
          }
        }
        
        return processedValue;
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return Promise.all(value.map(processValue));
        } else {
          const processed: any = {};
          for (const [key, val] of Object.entries(value)) {
            processed[key] = await processValue(val);
          }
          return processed;
        }
      }
      
      return value;
    };

    return await processValue(processedConfig);
  }

  async listAssistantFullSlugs(organizationId?: string | null): Promise<FullSlug[]> {
    let assistants = this.config.assistants;

    // Filter by organization if specified
    if (organizationId) {
      const org = this.findOrganizationById(organizationId);
      if (org) {
        assistants = assistants.filter(assistant => assistant.ownerSlug === org.slug);
      } else {
        return []; // Organization not found
      }
    }

    // Convert to full slugs format: "ownerSlug/packageSlug@versionSlug"
    return assistants.map(assistant => 
      `${assistant.ownerSlug}/${assistant.packageSlug}@${assistant.version}`
    );
  }

  async listOrganizations(userId?: string): Promise<OrganizationDescription[]> {
    if (!userId) {
      // Return all organizations (for admin purposes)
      return this.config.organizations.map(org => ({
        id: org.id,
        iconUrl: org.iconUrl,
        name: org.name,
        slug: org.slug
      }));
    }

    // Find user and return only their organizations
    const user = this.findUserById(userId);
    if (!user) {
      return [];
    }

    const userOrgs: OrganizationDescription[] = [];
    for (const orgId of user.organizations) {
      const org = this.findOrganizationById(orgId);
      if (org) {
        userOrgs.push({
          id: org.id,
          iconUrl: org.iconUrl,
          name: org.name,
          slug: org.slug
        });
      }
    }

    return userOrgs;
  }

  async getFreeTrialStatus(userId?: string): Promise<FreeTrialStatus> {
    if (!userId) {
      // Return default free trial status if no user specified
      return {
        optedInToFreeTrial: this.config.freeTrialSettings.defaultOptIn,
        chatCount: 0,
        autocompleteCount: 0,
        chatLimit: this.config.freeTrialSettings.chatLimit,
        autocompleteLimit: this.config.freeTrialSettings.autocompleteLimit
      };
    }

    const usage = this.freeTrialUsage.get(userId);
    if (!usage) {
      // Create new usage entry for user
      const newUsage: FreeTrialUsage = {
        userId,
        optedInToFreeTrial: this.config.freeTrialSettings.defaultOptIn,
        chatCount: 0,
        autocompleteCount: 0,
        lastResetDate: new Date().toISOString()
      };
      this.freeTrialUsage.set(userId, newUsage);
      return {
        optedInToFreeTrial: newUsage.optedInToFreeTrial,
        chatCount: newUsage.chatCount,
        autocompleteCount: newUsage.autocompleteCount,
        chatLimit: this.config.freeTrialSettings.chatLimit,
        autocompleteLimit: this.config.freeTrialSettings.autocompleteLimit
      };
    }

    return {
      optedInToFreeTrial: usage.optedInToFreeTrial,
      chatCount: usage.chatCount,
      autocompleteCount: usage.autocompleteCount,
      chatLimit: this.config.freeTrialSettings.chatLimit,
      autocompleteLimit: this.config.freeTrialSettings.autocompleteLimit
    };
  }

  async updateFreeTrialUsage(userId: string, chatIncrement = 0, autocompleteIncrement = 0): Promise<void> {
    const usage = this.freeTrialUsage.get(userId);
    if (usage) {
      usage.chatCount += chatIncrement;
      usage.autocompleteCount += autocompleteIncrement;
      this.freeTrialUsage.set(userId, usage);
    }
  }

  // Helper methods
  private findUserById(userId: string): UserConfig | undefined {
    return this.config.users.find(user => user.id === userId);
  }

  private findUserBySlug(userSlug: string): UserConfig | undefined {
    return this.config.users.find(user => user.slug === userSlug);
  }

  private findOrganizationById(orgId: string): OrganizationConfig | undefined {
    return this.config.organizations.find(org => org.id === orgId);
  }

  private findOrganizationBySlug(orgSlug: string): OrganizationConfig | undefined {
    return this.config.organizations.find(org => org.slug === orgSlug);
  }

  // Method to get actual secret value (for internal use, e.g., by proxy)
  getSecretValue(secretLocation: SecretLocation): string | undefined {
    switch (secretLocation.secretType) {
      case 'user':
        if (secretLocation.userSlug) {
          const userSecrets = this.config.secrets.user[secretLocation.userSlug];
          return userSecrets?.secrets[secretLocation.secretName];
        }
        break;
      case 'organization':
        if (secretLocation.orgSlug) {
          const orgSecrets = this.config.secrets.organization[secretLocation.orgSlug];
          return orgSecrets?.secrets[secretLocation.secretName];
        }
        break;
      case 'models_add_on':
        if (secretLocation.blockSlug) {
          const modelsAddOnSecrets = this.config.secrets.modelsAddOn[secretLocation.blockSlug];
          return modelsAddOnSecrets?.secrets[secretLocation.secretName];
        }
        break;
      case 'free_trial':
        if (secretLocation.blockSlug) {
          const freeTrialSecrets = this.config.secrets.freeTrial[secretLocation.blockSlug];
          return freeTrialSecrets?.secrets[secretLocation.secretName];
        }
        break;
    }
    return undefined;
  }
}
