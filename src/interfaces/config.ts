/**
 * Configuration structure for the Continue.dev platform proxy
 * This defines the YAML configuration file structure
 */

export interface ProxyConfig {
  users: UserConfig[];
  organizations: OrganizationConfig[];
  assistants: AssistantConfig[];
  secrets: SecretsConfig;
  freeTrialSettings: FreeTrialConfig;
}

export interface UserConfig {
  id: string;
  slug: string;
  name: string;
  email: string;
  organizations: string[]; // Array of organization IDs the user belongs to
  role: 'admin' | 'member';
}

export interface OrganizationConfig {
  id: string;
  slug: string;
  name: string;
  iconUrl: string;
  tier: 'solo' | 'teams' | 'enterprise';
  members: OrganizationMember[];
}

export interface OrganizationMember {
  userId: string;
  role: 'admin' | 'member';
}

export interface AssistantConfig {
  ownerSlug: string;
  packageSlug: string;
  version: string;
  iconUrl?: string;
  onPremProxyUrl?: string;
  useOnPremProxy?: boolean;
  rawYaml: string;
  config: AssistantUnrolledConfig;
}

export interface AssistantUnrolledConfig {
  name: string;
  version: string;
  models?: ModelConfig[];
  context?: ContextConfig[];
  data?: DataConfig[];
  mcpServers?: MCPServerConfig[];
  prompts?: PromptConfig[];
  docs?: DocsConfig[];
}

export interface ModelConfig {
  title: string;
  provider: string;
  model: string;
  apiKey?: string; // Can contain template variables like ${{ secrets.user123/my-assistant@OPENAI_API_KEY }}
  apiBase?: string;
  [key: string]: any; // Allow additional provider-specific config
}

export interface ContextConfig {
  name: string;
  type: string;
  [key: string]: any;
}

export interface DataConfig {
  name: string;
  type: string;
  [key: string]: any;
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  [key: string]: any;
}

export interface PromptConfig {
  name: string;
  template: string;
  [key: string]: any;
}

export interface DocsConfig {
  name: string;
  url: string;
  [key: string]: any;
}

export interface SecretsConfig {
  user: Record<string, UserSecretsConfig>; // keyed by userSlug
  organization: Record<string, OrganizationSecretsConfig>; // keyed by orgSlug
  modelsAddOn: Record<string, ModelsAddOnSecretsConfig>; // keyed by blockSlug
  freeTrial: Record<string, FreeTrialSecretsConfig>; // keyed by blockSlug
}

export interface UserSecretsConfig {
  secrets: Record<string, string>; // secretName -> secretValue
}

export interface OrganizationSecretsConfig {
  secrets: Record<string, string>; // secretName -> secretValue (not returned to IDE)
}

export interface ModelsAddOnSecretsConfig {
  secrets: Record<string, string>; // secretName -> secretValue
}

export interface FreeTrialSecretsConfig {
  secrets: Record<string, string>; // secretName -> secretValue
}

export interface FreeTrialConfig {
  chatLimit: number;
  autocompleteLimit: number;
  defaultOptIn: boolean;
  // Runtime usage tracking (will be stored in memory/database)
  usage?: Record<string, FreeTrialUsage>; // keyed by userId
}

export interface FreeTrialUsage {
  userId: string;
  optedInToFreeTrial: boolean;
  chatCount: number;
  autocompleteCount: number;
  lastResetDate: string; // ISO date string
}
