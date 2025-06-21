import * as fs from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';
import { ProxyConfig } from '../interfaces/config';
import { IStorage } from '../interfaces/storage';
import { InMemoryStorage } from './inMemoryStorage';

/**
 * Configuration service for loading and managing the proxy configuration
 */
export class ConfigService {
  private static instance: ConfigService;
  private storage: IStorage | null = null;
  private config: ProxyConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Initialize the configuration service from a YAML file
   * @param configPath Path to the config.yaml file
   */
  public async initialize(configPath?: string): Promise<void> {
    const yamlPath = configPath || process.env.PROXY_CONFIG_PATH || './config.yaml';
    
    try {
      if (!fs.existsSync(yamlPath)) {
        console.log(`Config file not found at ${yamlPath}, creating default configuration...`);
        await this.createDefaultConfig(yamlPath);
      }

      const yamlContent = fs.readFileSync(yamlPath, 'utf8');
      this.config = yaml.load(yamlContent) as ProxyConfig;
      
      // Validate the configuration
      this.validateConfig(this.config);
      
      // Initialize storage with the loaded configuration
      this.storage = new InMemoryStorage(this.config);
      
      console.log(`Configuration loaded successfully from ${yamlPath}`);
      console.log(`- Users: ${this.config.users.length}`);
      console.log(`- Organizations: ${this.config.organizations.length}`);
      console.log(`- Assistants: ${this.config.assistants.length}`);
    } catch (error: any) {
      console.error('Failed to load configuration:', error);
      throw new Error(`Configuration loading failed: ${error?.message || error}`);
    }
  }

  /**
   * Get the storage instance
   */
  public getStorage(): IStorage {
    if (!this.storage) {
      throw new Error('Configuration service not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  /**
   * Get the raw configuration
   */
  public getConfig(): ProxyConfig {
    if (!this.config) {
      throw new Error('Configuration service not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Reload configuration from file
   */
  public async reload(configPath?: string): Promise<void> {
    await this.initialize(configPath);
  }

  /**
   * Create a default configuration file
   */
  private async createDefaultConfig(configPath: string): Promise<void> {
    const defaultConfig: ProxyConfig = {
      users: [
        {
          id: 'user-001',
          slug: 'demo-user',
          name: 'Demo User',
          email: 'demo@example.com',
          organizations: ['org-001'],
          role: 'admin'
        }
      ],
      organizations: [
        {
          id: 'org-001',
          slug: 'demo-org',
          name: 'Demo Organization',
          iconUrl: 'https://via.placeholder.com/64x64.png?text=DO',
          tier: 'teams',
          members: [
            {
              userId: 'user-001',
              role: 'admin'
            }
          ]
        }
      ],
      assistants: [
        {
          ownerSlug: 'demo-user',
          packageSlug: 'default-assistant',
          version: '1.0.0',
          iconUrl: 'https://via.placeholder.com/64x64.png?text=AI',
          useOnPremProxy: false,
          rawYaml: `name: Default Assistant
version: 1.0.0
models:
  - title: GPT-4
    provider: openai
    model: gpt-4
    apiKey: \${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }}
context:
  - name: code
    type: highlight
prompts:
  - name: system
    template: "You are a helpful AI coding assistant."`,
          config: {
            name: 'Default Assistant',
            version: '1.0.0',
            models: [
              {
                title: 'GPT-4',
                provider: 'openai',
                model: 'gpt-4',
                apiKey: '${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }}'
              }
            ],
            context: [
              {
                name: 'code',
                type: 'highlight'
              }
            ],
            prompts: [
              {
                name: 'system',
                template: 'You are a helpful AI coding assistant.'
              }
            ]
          }
        }
      ],
      secrets: {
        user: {
          'demo-user': {
            secrets: {
              OPENAI_API_KEY: 'sk-your-openai-api-key-here',
              ANTHROPIC_API_KEY: 'sk-ant-your-anthropic-key-here'
            }
          }
        },
        organization: {
          'demo-org': {
            secrets: {
              TEAM_OPENAI_API_KEY: 'sk-team-openai-key-here',
              TEAM_ANTHROPIC_API_KEY: 'sk-ant-team-key-here'
            }
          }
        },
        modelsAddOn: {
          'openai-addon': {
            secrets: {
              OPENAI_API_KEY: 'sk-addon-openai-key-here'
            }
          }
        },
        freeTrial: {
          'free-trial-block': {
            secrets: {
              OPENAI_API_KEY: 'sk-free-trial-openai-key-here'
            }
          }
        }
      },
      freeTrialSettings: {
        chatLimit: 100,
        autocompleteLimit: 500,
        defaultOptIn: true
      }
    };

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write the default configuration
    const yamlContent = yaml.dump(defaultConfig, {
      indent: 2,
      lineWidth: 120,
      quotingType: '"'
    });

    fs.writeFileSync(configPath, yamlContent, 'utf8');
    console.log(`Default configuration created at ${configPath}`);
  }

  /**
   * Validate the loaded configuration
   */
  private validateConfig(config: ProxyConfig): void {
    if (!config.users || !Array.isArray(config.users)) {
      throw new Error('Configuration must include a users array');
    }

    if (!config.organizations || !Array.isArray(config.organizations)) {
      throw new Error('Configuration must include an organizations array');
    }

    if (!config.assistants || !Array.isArray(config.assistants)) {
      throw new Error('Configuration must include an assistants array');
    }

    if (!config.secrets) {
      throw new Error('Configuration must include a secrets object');
    }

    if (!config.freeTrialSettings) {
      throw new Error('Configuration must include freeTrialSettings');
    }

    // Validate required fields in freeTrialSettings
    if (typeof config.freeTrialSettings.chatLimit !== 'number' || 
        typeof config.freeTrialSettings.autocompleteLimit !== 'number') {
      throw new Error('freeTrialSettings must include numeric chatLimit and autocompleteLimit');
    }

    // Validate user references in organizations
    for (const org of config.organizations) {
      for (const member of org.members) {
        const userExists = config.users.some(user => user.id === member.userId);
        if (!userExists) {
          throw new Error(`Organization ${org.id} references non-existent user ${member.userId}`);
        }
      }
    }

    console.log('Configuration validation passed');
  }
}
