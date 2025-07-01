import { InMemoryStorage } from './inMemoryStorage';
import { ProxyConfig } from '../interfaces/config';
import { FQSN, SecretResult, FreeTrialStatus } from '../interfaces/storage';

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;
  let mockConfig: ProxyConfig;

  beforeEach(() => {
    mockConfig = {
      users: [
        {
          id: 'user-001',
          slug: 'demo-user',
          name: 'Demo User',
          email: 'demo@example.com',
          organizations: ['org-001'],
          role: 'admin'
        },
        {
          id: 'user-002',
          slug: 'jane-developer',
          name: 'Jane Developer',
          email: 'jane@example.com',
          organizations: ['org-001'],
          role: 'member'
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
            { userId: 'user-001', role: 'admin' },
            { userId: 'user-002', role: 'member' }
          ]
        },
        {
          id: 'org-002',
          slug: 'acme-corp',
          name: 'ACME Corp',
          iconUrl: 'https://via.placeholder.com/64x64.png?text=AC',
          tier: 'enterprise',
          members: [
            { userId: 'user-001', role: 'admin' }
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
  - name: GPT-4
    provider: calliope-proxy
    model: openai/gpt-4o
    apiKey: \${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }}
  - name: Claude 3.5 Sonnet
    provider: calliope-proxy
    model: anthropic/claude-3-7-sonnet
    apiKey: \${{ secrets.demo-user/default-assistant@ANTHROPIC_API_KEY }}`,
          config: {
            name: 'Default Assistant',
            version: '1.0.0',
            models: [
              {
                title: 'GPT-4',
                provider: 'calliope-proxy',
                model: 'openai/gpt-4o',
                apiKey: '${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }}'
              },
              {
                title: 'Claude 3.5 Sonnet',
                provider: 'calliope-proxy',
                model: 'anthropic/claude-3-7-sonnet',
                apiKey: '${{ secrets.demo-user/default-assistant@ANTHROPIC_API_KEY }}'
              }
            ]
          }
        },
        {
          ownerSlug: 'demo-org',
          packageSlug: 'team-assistant',
          version: '2.1.3',
          iconUrl: 'https://via.placeholder.com/64x64.png?text=TA',
          useOnPremProxy: true,
          rawYaml: `name: Team Assistant
version: 2.1.3
models:
  - name: GPT-4 Turbo
    provider: calliope-proxy
    model: openai/gpt-4o
    apiKey: \${{ secrets.demo-org/team-assistant@OPENAI_API_KEY }}`,
          config: {
            name: 'Team Assistant',
            version: '2.1.3',
            models: [
              {
                title: 'GPT-4 Turbo',
                provider: 'calliope-proxy',
                model: 'openai/gpt-4o',
                apiKey: '${{ secrets.demo-org/team-assistant@OPENAI_API_KEY }}'
              }
            ]
          }
        }
      ],
      secrets: {
        user: {
          'demo-user': {
            secrets: {
              OPENAI_API_KEY: 'sk-user-openai-key-demo',
              ANTHROPIC_API_KEY: 'sk-ant-user-anthropic-key-demo'
            }
          },
          'jane-developer': {
            secrets: {
              OPENAI_API_KEY: 'sk-jane-openai-key-demo',
              ANTHROPIC_API_KEY: 'sk-ant-jane-anthropic-key-demo'
            }
          }
        },
        organization: {
          'demo-org': {
            secrets: {
              OPENAI_API_KEY: 'sk-org-openai-key-demo',
              ANTHROPIC_API_KEY: 'sk-ant-org-anthropic-key-demo',
              TEAM_SHARED_SECRET: 'org-secret-for-team-features'
            }
          },
          'acme-corp': {
            secrets: {
              OPENAI_API_KEY: 'sk-acme-openai-key-demo',
              ANTHROPIC_API_KEY: 'sk-ant-acme-anthropic-key-demo'
            }
          }
        },
        modelsAddOn: {
          'openai-addon': {
            secrets: {
              OPENAI_API_KEY: 'sk-addon-openai-key-demo'
            }
          },
          'anthropic-addon': {
            secrets: {
              ANTHROPIC_API_KEY: 'sk-ant-addon-anthropic-key-demo'
            }
          }
        },
        freeTrial: {
          'free-trial-block': {
            secrets: {
              OPENAI_API_KEY: 'sk-free-trial-openai-key-demo',
              ANTHROPIC_API_KEY: 'sk-ant-free-trial-anthropic-key-demo'
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

    storage = new InMemoryStorage(mockConfig);
  });

  describe('constructor and initialization', () => {
    it('should initialize with provided config', () => {
      expect(storage).toBeInstanceOf(InMemoryStorage);
    });

    it('should initialize free trial usage for all users', async () => {
      const status1 = await storage.getFreeTrialStatus('user-001');
      const status2 = await storage.getFreeTrialStatus('user-002');

      expect(status1.optedInToFreeTrial).toBe(true);
      expect(status1.chatCount).toBe(0);
      expect(status1.autocompleteCount).toBe(0);
      expect(status1.chatLimit).toBe(100);
      expect(status1.autocompleteLimit).toBe(500);

      expect(status2.optedInToFreeTrial).toBe(true);
      expect(status2.chatCount).toBe(0);
      expect(status2.autocompleteCount).toBe(0);
    });
  });

  describe('resolveSecrets', () => {
    describe('user secret resolution', () => {
      it('should resolve user secrets to actual values', async () => {
        const fqsns: FQSN[] = [
          {
            ownerSlug: 'demo-user',
            packageSlug: 'default-assistant',
            secretName: 'OPENAI_API_KEY'
          }
        ];

        const results = await storage.resolveSecrets(fqsns, null);
        
        expect(results).toHaveLength(1);
        expect(results[0]).toBeDefined();
        expect(results[0]!.fqsn).toEqual(fqsns[0]);
        expect(results[0]!.value).toBe('sk-user-openai-key-demo');
        expect(results[0]!.secretLocation).toBeUndefined();
      });

      it('should return undefined for non-existent user secrets', async () => {
        const fqsns: FQSN[] = [
          {
            ownerSlug: 'nonexistent-user',
            packageSlug: 'some-assistant',
            secretName: 'NON_EXISTENT_SECRET'
          }
        ];

        const results = await storage.resolveSecrets(fqsns, null);
        
        expect(results).toHaveLength(1);
        expect(results[0]).toBeUndefined();
      });
    });

    describe('organization secret resolution', () => {
      it('should resolve organization secrets to locations for teams tier', async () => {
        // Remove models add-on secrets to test org resolution
        const testConfig = { ...mockConfig };
        testConfig.secrets.modelsAddOn = {};
        const testStorage = new InMemoryStorage(testConfig);
        
        const fqsns: FQSN[] = [
          {
            ownerSlug: 'demo-org',
            packageSlug: 'team-assistant',
            secretName: 'OPENAI_API_KEY'
          }
        ];

        const results = await testStorage.resolveSecrets(fqsns, 'demo-org');
        
        expect(results).toHaveLength(1);
        expect(results[0]).toBeDefined();
        expect(results[0]!.fqsn).toEqual(fqsns[0]);
        expect(results[0]!.value).toBeUndefined();
        expect(results[0]!.secretLocation).toEqual({
          secretType: 'organization',
          orgSlug: 'demo-org',
          secretName: 'OPENAI_API_KEY'
        });
      });

      it('should fall back to user secrets when org secrets not found', async () => {
        // Remove models add-on secrets and make sure we're testing fallback properly
        const testConfig = { ...mockConfig };
        testConfig.secrets.modelsAddOn = {};
        // Remove the specific org secret to test fallback
        delete testConfig.secrets.organization['demo-org'].secrets.OPENAI_API_KEY;
        const testStorage = new InMemoryStorage(testConfig);
        
        const fqsns: FQSN[] = [
          {
            ownerSlug: 'demo-user',
            packageSlug: 'default-assistant',
            secretName: 'OPENAI_API_KEY'
          }
        ];

        const results = await testStorage.resolveSecrets(fqsns, 'demo-org');
        
        expect(results).toHaveLength(1);
        expect(results[0]).toBeDefined();
        expect(results[0]!.value).toBe('sk-user-openai-key-demo');
        expect(results[0]!.secretLocation).toBeUndefined();
      });
    });

    describe('models add-on secret resolution', () => {
      it('should resolve models add-on secrets to locations', async () => {
        const fqsns: FQSN[] = [
          {
            ownerSlug: 'some-owner',
            packageSlug: 'some-package',
            secretName: 'OPENAI_API_KEY'
          }
        ];

        const results = await storage.resolveSecrets(fqsns, 'demo-org');
        
        expect(results).toHaveLength(1);
        expect(results[0]).toBeDefined();
        expect(results[0]!.secretLocation).toEqual({
          secretType: 'models_add_on',
          blockSlug: 'openai-addon',
          secretName: 'OPENAI_API_KEY'
        });
      });
    });

    describe('free trial secret resolution', () => {
      it('should resolve free trial secrets for personal workspace', async () => {
        const fqsns: FQSN[] = [
          {
            ownerSlug: 'unknown-user',
            packageSlug: 'some-package',
            secretName: 'OPENAI_API_KEY'
          }
        ];

        const results = await storage.resolveSecrets(fqsns, null);
        
        expect(results).toHaveLength(1);
        expect(results[0]).toBeDefined();
        expect(results[0]!.secretLocation).toEqual({
          secretType: 'free_trial',
          blockSlug: 'free-trial-block',
          secretName: 'OPENAI_API_KEY'
        });
      });
    });

    describe('secret resolution hierarchy', () => {
      it('should follow correct hierarchy for teams organization', async () => {
        // Create a config where all secret types exist for the same secret
        const testConfig = { ...mockConfig };
        testConfig.secrets.user['demo-org'] = {
          secrets: { TEST_SECRET: 'user-value' }
        };
        testConfig.secrets.organization['demo-org'].secrets.TEST_SECRET = 'org-value';
        testConfig.secrets.modelsAddOn['test-addon'] = {
          secrets: { TEST_SECRET: 'addon-value' }
        };
        
        const testStorage = new InMemoryStorage(testConfig);

        const fqsns: FQSN[] = [
          {
            ownerSlug: 'demo-org',
            packageSlug: 'team-assistant',
            secretName: 'TEST_SECRET'
          }
        ];

        const results = await testStorage.resolveSecrets(fqsns, 'demo-org');
        
        // Should prioritize models add-on first
        expect(results[0]!.secretLocation?.secretType).toBe('models_add_on');
        expect(results[0]!.secretLocation?.blockSlug).toBe('test-addon');
      });
    });

    it('should handle multiple FQSNs', async () => {
      const fqsns: FQSN[] = [
        {
          ownerSlug: 'demo-user',
          packageSlug: 'default-assistant',
          secretName: 'OPENAI_API_KEY'
        },
        {
          ownerSlug: 'demo-user',
          packageSlug: 'default-assistant',
          secretName: 'ANTHROPIC_API_KEY'
        }
      ];

      const results = await storage.resolveSecrets(fqsns, null);
      
      expect(results).toHaveLength(2);
      expect(results[0]!.value).toBe('sk-user-openai-key-demo');
      expect(results[1]!.value).toBe('sk-ant-user-anthropic-key-demo');
    });
  });

  describe('listAssistants', () => {
    it('should return all assistants when no organization filter', async () => {
      const assistants = await storage.listAssistants();
      
      expect(assistants).toHaveLength(2);
      expect(assistants[0].ownerSlug).toBe('demo-user');
      expect(assistants[0].packageSlug).toBe('default-assistant');
      expect(assistants[1].ownerSlug).toBe('demo-org');
      expect(assistants[1].packageSlug).toBe('team-assistant');
    });

    it('should filter assistants by organization ID', async () => {
      const assistants = await storage.listAssistants('org-001');
      
      expect(assistants).toHaveLength(1);
      expect(assistants[0].ownerSlug).toBe('demo-org');
      expect(assistants[0].packageSlug).toBe('team-assistant');
    });

    it('should filter assistants by organization slug', async () => {
      const assistants = await storage.listAssistants('demo-org');
      
      expect(assistants).toHaveLength(1);
      expect(assistants[0].ownerSlug).toBe('demo-org');
    });

    it('should return empty array for non-existent organization', async () => {
      const assistants = await storage.listAssistants('non-existent-org');
      
      expect(assistants).toHaveLength(0);
    });

    it('should process template variables in configuration', async () => {
      const assistants = await storage.listAssistants(null);
      
      const userAssistant = assistants.find(a => a.ownerSlug === 'demo-user');
      expect(userAssistant).toBeDefined();
      
      // User secrets should be resolved to actual values
      const gpt4Model = userAssistant!.configResult.config!.models![0];
      expect(gpt4Model.apiKey).toBe('sk-user-openai-key-demo');
    });

    it('should process organization secrets correctly', async () => {
      // Remove models add-on secrets to test org resolution
      const testConfig = { ...mockConfig };
      testConfig.secrets.modelsAddOn = {};
      const testStorage = new InMemoryStorage(testConfig);
      
      const assistants = await testStorage.listAssistants('demo-org');
      
      const orgAssistant = assistants[0];
      const model = orgAssistant.configResult.config!.models![0];
      
      // Organization secrets should be encoded as location strings
      expect(model.apiKey).toBe('organization:demo-org/OPENAI_API_KEY');
    });

    it('should prioritize models add-on secrets over organization secrets', async () => {
      const assistants = await storage.listAssistants('demo-org');
      
      const orgAssistant = assistants[0];
      const model = orgAssistant.configResult.config!.models![0];
      
      // Models add-on secrets should take priority
      expect(model.apiKey).toBe('models_add_on:openai-addon/OPENAI_API_KEY');
    });

    it('should set alwaysUseProxy flag correctly', async () => {
      const assistants = await storage.listAssistants(null, true);
      
      assistants.forEach(assistant => {
        expect(assistant.useOnPremProxy).toBe(true);
      });
    });

    it('should preserve assistant metadata', async () => {
      const assistants = await storage.listAssistants();
      
      const userAssistant = assistants.find(a => a.ownerSlug === 'demo-user');
      expect(userAssistant!.iconUrl).toBe('https://via.placeholder.com/64x64.png?text=AI');
      expect(userAssistant!.rawYaml).toContain('name: Default Assistant');
      expect(userAssistant!.configResult.configLoadInterrupted).toBe(false);
      expect(userAssistant!.configResult.errors).toBeNull();
    });
  });

  describe('listAssistantFullSlugs', () => {
    it('should return full slugs for all assistants', async () => {
      const fullSlugs = await storage.listAssistantFullSlugs();
      
      expect(fullSlugs).toHaveLength(2);
      expect(fullSlugs).toContain('demo-user/default-assistant@1.0.0');
      expect(fullSlugs).toContain('demo-org/team-assistant@2.1.3');
    });

    it('should filter by organization', async () => {
      const fullSlugs = await storage.listAssistantFullSlugs('demo-org');
      
      expect(fullSlugs).toHaveLength(1);
      expect(fullSlugs[0]).toBe('demo-org/team-assistant@2.1.3');
    });

    it('should return empty array for non-existent organization', async () => {
      const fullSlugs = await storage.listAssistantFullSlugs('non-existent');
      
      expect(fullSlugs).toHaveLength(0);
    });
  });

  describe('listOrganizations', () => {
    it('should return all organizations when no user ID provided', async () => {
      const organizations = await storage.listOrganizations();
      
      expect(organizations).toHaveLength(2);
      expect(organizations[0]).toEqual({
        id: 'org-001',
        iconUrl: 'https://via.placeholder.com/64x64.png?text=DO',
        name: 'Demo Organization',
        slug: 'demo-org'
      });
      expect(organizations[1]).toEqual({
        id: 'org-002',
        iconUrl: 'https://via.placeholder.com/64x64.png?text=AC',
        name: 'ACME Corp',
        slug: 'acme-corp'
      });
    });

    it('should return user-specific organizations', async () => {
      const organizations = await storage.listOrganizations('user-001');
      
      expect(organizations).toHaveLength(1);
      expect(organizations[0].id).toBe('org-001');
      expect(organizations[0].name).toBe('Demo Organization');
    });

    it('should return empty array for non-existent user', async () => {
      const organizations = await storage.listOrganizations('non-existent-user');
      
      expect(organizations).toHaveLength(0);
    });

    it('should return organizations for user with multiple orgs', async () => {
      // Add user-001 to org-002
      mockConfig.users[0].organizations.push('org-002');
      const testStorage = new InMemoryStorage(mockConfig);
      
      const organizations = await testStorage.listOrganizations('user-001');
      
      expect(organizations).toHaveLength(2);
    });
  });

  describe('getFreeTrialStatus', () => {
    it('should return default status when no user ID provided', async () => {
      const status = await storage.getFreeTrialStatus();
      
      expect(status).toEqual({
        optedInToFreeTrial: true,
        chatCount: 0,
        autocompleteCount: 0,
        chatLimit: 100,
        autocompleteLimit: 500
      });
    });

    it('should return user-specific status', async () => {
      const status = await storage.getFreeTrialStatus('user-001');
      
      expect(status.optedInToFreeTrial).toBe(true);
      expect(status.chatCount).toBe(0);
      expect(status.autocompleteCount).toBe(0);
      expect(status.chatLimit).toBe(100);
      expect(status.autocompleteLimit).toBe(500);
    });

    it('should create new usage entry for unknown user', async () => {
      const status = await storage.getFreeTrialStatus('unknown-user');
      
      expect(status.optedInToFreeTrial).toBe(true);
      expect(status.chatCount).toBe(0);
      expect(status.autocompleteCount).toBe(0);
    });
  });

  describe('updateFreeTrialUsage', () => {
    it('should update chat and autocomplete counts', async () => {
      await storage.updateFreeTrialUsage('user-001', 5, 10);
      
      const status = await storage.getFreeTrialStatus('user-001');
      expect(status.chatCount).toBe(5);
      expect(status.autocompleteCount).toBe(10);
    });

    it('should increment existing counts', async () => {
      await storage.updateFreeTrialUsage('user-001', 3, 7);
      await storage.updateFreeTrialUsage('user-001', 2, 3);
      
      const status = await storage.getFreeTrialStatus('user-001');
      expect(status.chatCount).toBe(5);
      expect(status.autocompleteCount).toBe(10);
    });

    it('should handle default parameters', async () => {
      await storage.updateFreeTrialUsage('user-001');
      
      const status = await storage.getFreeTrialStatus('user-001');
      expect(status.chatCount).toBe(0);
      expect(status.autocompleteCount).toBe(0);
    });

    it('should do nothing for non-existent user', async () => {
      // Should not throw error
      await expect(storage.updateFreeTrialUsage('non-existent-user', 5, 10))
        .resolves.toBeUndefined();
    });
  });

  describe('getSecretValue', () => {
    it('should retrieve user secret value', () => {
      const secretLocation = {
        secretType: 'user' as const,
        userSlug: 'demo-user',
        secretName: 'OPENAI_API_KEY'
      };
      
      const value = storage.getSecretValue(secretLocation);
      expect(value).toBe('sk-user-openai-key-demo');
    });

    it('should retrieve organization secret value', () => {
      const secretLocation = {
        secretType: 'organization' as const,
        orgSlug: 'demo-org',
        secretName: 'OPENAI_API_KEY'
      };
      
      const value = storage.getSecretValue(secretLocation);
      expect(value).toBe('sk-org-openai-key-demo');
    });

    it('should retrieve models add-on secret value', () => {
      const secretLocation = {
        secretType: 'models_add_on' as const,
        blockSlug: 'openai-addon',
        secretName: 'OPENAI_API_KEY'
      };
      
      const value = storage.getSecretValue(secretLocation);
      expect(value).toBe('sk-addon-openai-key-demo');
    });

    it('should retrieve free trial secret value', () => {
      const secretLocation = {
        secretType: 'free_trial' as const,
        blockSlug: 'free-trial-block',
        secretName: 'OPENAI_API_KEY'
      };
      
      const value = storage.getSecretValue(secretLocation);
      expect(value).toBe('sk-free-trial-openai-key-demo');
    });

    it('should return undefined for non-existent secret', () => {
      const secretLocation = {
        secretType: 'user' as const,
        userSlug: 'non-existent-user',
        secretName: 'OPENAI_API_KEY'
      };
      
      const value = storage.getSecretValue(secretLocation);
      expect(value).toBeUndefined();
    });

    it('should return undefined for missing secret name', () => {
      const secretLocation = {
        secretType: 'user' as const,
        userSlug: 'demo-user',
        secretName: 'NON_EXISTENT_SECRET'
      };
      
      const value = storage.getSecretValue(secretLocation);
      expect(value).toBeUndefined();
    });
  });

  describe('processTemplateVariables', () => {
    it('should handle multiple templates in single string', async () => {
      const testConfig = {
        ...mockConfig,
        assistants: [{
          ...mockConfig.assistants[0],
          config: {
            name: 'Test Assistant',
            version: '1.0.0',
            models: [{
              title: 'Multi-Secret Model',
              provider: 'test',
              model: 'test',
              apiKey: '${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }}',
              secondaryKey: '${{ secrets.demo-user/default-assistant@ANTHROPIC_API_KEY }}'
            }]
          }
        }]
      };

      const testStorage = new InMemoryStorage(testConfig);
      const assistants = await testStorage.listAssistants();
      
      const model = assistants[0].configResult.config!.models![0];
      expect(model.apiKey).toBe('sk-user-openai-key-demo');
      expect(model.secondaryKey).toBe('sk-ant-user-anthropic-key-demo');
    });

    it('should handle nested objects and arrays', async () => {
      const testConfig = {
        ...mockConfig,
        assistants: [{
          ...mockConfig.assistants[0],
          config: {
            name: 'Test Assistant',
            version: '1.0.0',
            nestedConfig: {
              deepSecret: '${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }}',
              arrayWithSecrets: [
                '${{ secrets.demo-user/default-assistant@ANTHROPIC_API_KEY }}',
                'regular-value'
              ]
            }
          }
        }]
      };

      const testStorage = new InMemoryStorage(testConfig);
      const assistants = await testStorage.listAssistants();
      
      const config = assistants[0].configResult.config!;
      expect((config as any).nestedConfig.deepSecret).toBe('sk-user-openai-key-demo');
      expect((config as any).nestedConfig.arrayWithSecrets[0]).toBe('sk-ant-user-anthropic-key-demo');
      expect((config as any).nestedConfig.arrayWithSecrets[1]).toBe('regular-value');
    });

    it('should preserve non-template strings', async () => {
      const testConfig = {
        ...mockConfig,
        assistants: [{
          ...mockConfig.assistants[0],
          config: {
            name: 'Test Assistant',
            version: '1.0.0',
            regularString: 'no templates here',
            mixedString: 'prefix ${{ secrets.demo-user/default-assistant@OPENAI_API_KEY }} suffix'
          }
        }]
      };

      const testStorage = new InMemoryStorage(testConfig);
      const assistants = await testStorage.listAssistants();
      
      const config = assistants[0].configResult.config!;
      expect((config as any).regularString).toBe('no templates here');
      expect((config as any).mixedString).toBe('prefix sk-user-openai-key-demo suffix');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed FQSN in template', async () => {
      const testConfig = {
        ...mockConfig,
        assistants: [{
          ...mockConfig.assistants[0],
          config: {
            name: 'Test Assistant',
            version: '1.0.0',
            models: [{
              title: 'Test Model',
              provider: 'test',
              model: 'test',
              apiKey: '${{ secrets.malformed-fqsn }}'
            }]
          }
        }]
      };

      const testStorage = new InMemoryStorage(testConfig);
      const assistants = await testStorage.listAssistants();
      
      // Should preserve original malformed template
      const model = assistants[0].configResult.config!.models![0];
      expect(model.apiKey).toBe('${{ secrets.malformed-fqsn }}');
    });

    it('should handle empty organization members list', async () => {
      const testConfig = {
        ...mockConfig,
        organizations: [{
          ...mockConfig.organizations[0],
          members: []
        }]
      };

      const testStorage = new InMemoryStorage(testConfig);
      const organizations = await testStorage.listOrganizations('user-001');
      
      expect(organizations).toHaveLength(1);
    });

    it('should handle missing secret blocks gracefully', async () => {
      const minimalConfig = {
        ...mockConfig,
        secrets: {
          user: {},
          organization: {},
          modelsAddOn: {},
          freeTrial: {}
        }
      };

      const testStorage = new InMemoryStorage(minimalConfig);
      const fqsns: FQSN[] = [{
        ownerSlug: 'demo-user',
        packageSlug: 'default-assistant',
        secretName: 'OPENAI_API_KEY'
      }];

      const results = await testStorage.resolveSecrets(fqsns, null);
      expect(results[0]).toBeUndefined();
    });
  });
});
