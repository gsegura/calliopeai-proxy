/**
 * Storage interfaces for Continue.dev platform data
 */

export interface FQSN {
  ownerSlug: string; // User slug or organization slug
  packageSlug: string; // Assistant/package identifier
  secretName: string; // Name of the secret (e.g., "OPENAI_API_KEY")
}

export interface SecretLocation {
  secretType:
    | "user"
    | "organization"
    | "package"
    | "models_add_on"
    | "free_trial"
    | "local_env"
    | "not_found";
  secretName: string;
  // Additional fields based on secretType
  userSlug?: string; // for user secrets
  orgSlug?: string; // for org secrets
  packageSlug?: string; // for package secrets
  blockSlug?: string; // for models_add_on/free_trial
}

export interface SecretResult {
  fqsn: FQSN;
  // For user secrets - value is returned directly
  value?: string;
  // For org/package secrets - location is returned for proxy resolution
  secretLocation?: SecretLocation;
}

export interface OrganizationDescription {
  id: string; // Unique organization identifier
  iconUrl: string; // URL to organization icon/logo
  name: string; // Display name for the organization
  slug?: string; // URL-safe slug used as prefix for org resources
}

export interface ConfigResult<T> {
  config: T | null;
  configLoadInterrupted: boolean;
  errors?: string[] | null;
}

export interface AssistantUnrolled {
  name: string;
  version: string;
  // Composable building blocks that define the assistant
  models?: any[]; // LLM configurations for chat, edit, etc.
  context?: any[]; // Context providers for code awareness
  data?: any[]; // Data sources and connections
  mcpServers?: any[]; // Model Context Protocol servers
  prompts?: any[]; // Custom prompts and templates
  docs?: any[]; // Documentation sources
}

export interface AssistantInfo {
  configResult: ConfigResult<AssistantUnrolled>;
  ownerSlug: string;
  packageSlug: string;
  iconUrl?: string | null;
  rawYaml: string;
  onPremProxyUrl?: string | null;
  useOnPremProxy?: boolean | null;
}

export interface FreeTrialStatus {
  optedInToFreeTrial: boolean;
  chatCount?: number;
  autocompleteCount?: number;
  chatLimit: number;
  autocompleteLimit: number;
}

export type FullSlug = string; // Format: "ownerSlug/packageSlug@versionSlug"

/**
 * Storage interface for managing Continue.dev platform data
 */
export interface IStorage {
  // Secret management
  resolveSecrets(fqsns: FQSN[], orgScopeId: string | null): Promise<(SecretResult | undefined)[]>;
  
  // Assistant management
  listAssistants(organizationId?: string | null, alwaysUseProxy?: boolean): Promise<AssistantInfo[]>;
  listAssistantFullSlugs(organizationId?: string | null): Promise<FullSlug[]>;
  
  // Organization management
  listOrganizations(userId?: string): Promise<OrganizationDescription[]>;
  
  // Free trial management
  getFreeTrialStatus(userId?: string): Promise<FreeTrialStatus>;
  updateFreeTrialUsage(userId: string, chatIncrement?: number, autocompleteIncrement?: number): Promise<void>;
}
