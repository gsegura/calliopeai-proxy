import {
    AssistantInfo,
    FQSN,
    FreeTrialStatus,
    FullSlug,
    IStorage,
    OrganizationDescription,
    SecretLocation,
    SecretResult
} from '../interfaces/storage';
import {AssistantConfig, FreeTrialUsage, OrganizationConfig, ProxyConfig, UserConfig} from '../interfaces/config';

/**
 * Secret resolution strategy interface following Strategy pattern
 */
interface SecretResolver {
    resolve(fqsn: FQSN): Promise<SecretResult | undefined>;
}

/**
 * Template processor for handling secret template variables
 */
class SecretTemplateProcessor {
    private static readonly TEMPLATE_REGEX = /\$\{\{\s*secrets\.([^\s}]+)\s*\}\}/g;

    constructor(private secretResolver: (fqsn: FQSN, orgScopeId: string | null) => Promise<SecretResult | undefined>) {
    }

    async processTemplateVariables(config: any, orgScopeId: string | null): Promise<any> {
        const processedConfig = this.deepClone(config);
        return await this.processValue(processedConfig, orgScopeId);
    }

    private async processValue(value: any, orgScopeId: string | null): Promise<any> {
        if (typeof value === 'string' && value.includes('${{')) {
            return await this.processStringTemplates(value, orgScopeId);
        }

        if (Array.isArray(value)) {
            return await Promise.all(value.map(item => this.processValue(item, orgScopeId)));
        }

        if (typeof value === 'object' && value !== null) {
            return await this.processObjectTemplates(value, orgScopeId);
        }

        return value;
    }

    private async processStringTemplates(value: string, orgScopeId: string | null): Promise<string> {
        let processedValue = value;
        const matches = Array.from(value.matchAll(SecretTemplateProcessor.TEMPLATE_REGEX));

        for (const match of matches) {
            const fullMatch = match[0];
            const fqsn = this.parseFQSN(match[1]);

            if (!fqsn) continue;

            const secretResult = await this.secretResolver(fqsn, orgScopeId);
            if (secretResult) {
                const replacement = this.getSecretReplacement(secretResult);
                processedValue = processedValue.replace(fullMatch, replacement);
            }
        }

        return processedValue;
    }

    private async processObjectTemplates(obj: Record<string, any>, orgScopeId: string | null): Promise<Record<string, any>> {
        const processedObject: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            processedObject[key] = await this.processValue(value, orgScopeId);
        }
        return processedObject;
    }

    private parseFQSN(fqsnString: string): FQSN | null {
        const parts = fqsnString.split('@');
        if (parts.length !== 2) return null;

        const ownerAndPackage = parts[0].split('/');
        const secretName = parts[1];

        if (ownerAndPackage.length < 1 || !secretName) return null;

        return {
            ownerSlug: ownerAndPackage[0],
            packageSlug: ownerAndPackage.slice(1).join('/'),
            secretName
        };
    }

    private getSecretReplacement(secretResult: SecretResult): string {
        if (secretResult.value) {
            return secretResult.value;
        }

        if (secretResult.secretLocation) {
            return this.encodeSecretLocation(secretResult.secretLocation);
        }

        return '';
    }

    private encodeSecretLocation(secretLocation: SecretLocation): string {
        const {secretType, orgSlug, userSlug, blockSlug, secretName} = secretLocation;
        let encodedLocation = `${secretType}:`;

        switch (secretType) {
            case 'organization':
                return `${encodedLocation}${orgSlug}/${secretName}`;
            case 'user':
                return `${encodedLocation}${userSlug}/${secretName}`;
            case 'models_add_on':
            case 'free_trial':
                return `${encodedLocation}${blockSlug}/${secretName}`;
            default:
                return `${encodedLocation}${secretName}`;
        }
    }

    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }
}

/**
 * Secret resolution hierarchy manager
 */
class SecretResolutionManager {
    constructor(private config: ProxyConfig) {
    }

    async resolveSingleSecret(fqsn: FQSN, orgScopeId: string | null): Promise<SecretResult | undefined> {
        const organization = orgScopeId ? this.findOrganizationBySlug(orgScopeId) : null;
        const resolvers = this.getResolverHierarchy(fqsn, organization || null);

        return await this.executeResolverHierarchy(resolvers);
    }

    private getResolverHierarchy(fqsn: FQSN, organization: OrganizationConfig | null): Array<() => Promise<SecretResult | undefined>> {
        if (organization) {
            return organization.tier === 'solo'
                ? this.getSoloResolverHierarchy(fqsn)
                : this.getTeamResolverHierarchy(fqsn, organization.slug);
        }

        return this.getPersonalResolverHierarchy(fqsn);
    }

    private getSoloResolverHierarchy(fqsn: FQSN): Array<() => Promise<SecretResult | undefined>> {
        return [
            () => this.resolveModelsAddOnSecret(fqsn),
            () => this.resolveUserSecret(fqsn),
            () => this.resolveFreeTrialSecret(fqsn)
        ];
    }

    private getTeamResolverHierarchy(fqsn: FQSN, orgSlug: string): Array<() => Promise<SecretResult | undefined>> {
        return [
            () => this.resolveModelsAddOnSecret(fqsn),
            () => this.resolveOrganizationSecret(fqsn, orgSlug),
            () => this.resolveUserSecret(fqsn)
        ];
    }

    private getPersonalResolverHierarchy(fqsn: FQSN): Array<() => Promise<SecretResult | undefined>> {
        return [
            () => this.resolveUserSecret(fqsn),
            () => this.resolveFreeTrialSecret(fqsn)
        ];
    }

    private async executeResolverHierarchy(resolvers: Array<() => Promise<SecretResult | undefined>>): Promise<SecretResult | undefined> {
        for (const resolver of resolvers) {
            const result = await resolver();
            if (result) return result;
        }
        return undefined;
    }

    private async resolveUserSecret(fqsn: FQSN): Promise<SecretResult | undefined> {
        const userSecrets = this.config.secrets.user[fqsn.ownerSlug];
        if (userSecrets?.secrets[fqsn.secretName]) {
            return {
                fqsn,
                value: userSecrets.secrets[fqsn.secretName]
            };
        }
        return undefined;
    }

    private async resolveOrganizationSecret(fqsn: FQSN, orgSlug: string): Promise<SecretResult | undefined> {
        const orgSecrets = this.config.secrets.organization[orgSlug];
        if (orgSecrets?.secrets[fqsn.secretName]) {
            return {
                fqsn,
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

    private findOrganizationBySlug(orgSlug: string): OrganizationConfig | undefined {
        return this.config.organizations.find(org => org.slug === orgSlug);
    }
}

/**
 * Assistant configuration processor
 */
class AssistantConfigProcessor {
    constructor(
        private config: ProxyConfig,
        private templateProcessor: SecretTemplateProcessor
    ) {
    }

    async processAssistants(
        assistants: AssistantConfig[],
        organizationId: string | null,
        alwaysUseProxy: boolean = false
    ): Promise<AssistantInfo[]> {
        const assistantInfos: AssistantInfo[] = [];

        for (const assistant of assistants) {
            const assistantInfo = await this.processAssistant(assistant, organizationId, alwaysUseProxy);
            assistantInfos.push(assistantInfo);
        }

        return assistantInfos;
    }

    private async processAssistant(
        assistant: AssistantConfig,
        organizationId: string | null,
        alwaysUseProxy: boolean
    ): Promise<AssistantInfo> {
        const processedConfig = await this.templateProcessor.processTemplateVariables(
            assistant.config,
            organizationId
        );

        return {
            configResult: {
                config: processedConfig,
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
    }
}

/**
 * Organization and user lookup utilities
 */
class EntityLookupService {
    constructor(private config: ProxyConfig) {
    }

    findUserById(userId: string): UserConfig | undefined {
        return this.config.users.find(user => user.id === userId);
    }

    findUserBySlug(userSlug: string): UserConfig | undefined {
        return this.config.users.find(user => user.slug === userSlug);
    }

    findOrganizationById(orgId: string): OrganizationConfig | undefined {
        return this.config.organizations.find(org => org.id === orgId);
    }

    findOrganizationBySlug(orgSlug: string): OrganizationConfig | undefined {
        return this.config.organizations.find(org => org.slug === orgSlug);
    }

    filterAssistantsByOrganization(assistants: AssistantConfig[], organizationId: string): AssistantConfig[] {
        const org = this.findOrganizationById(organizationId) || this.findOrganizationBySlug(organizationId);
        return org ? assistants.filter(assistant => assistant.ownerSlug === org.slug) : [];
    }
}

/**
 * Free trial usage manager
 */
class FreeTrialManager {
    private freeTrialUsage: Map<string, FreeTrialUsage> = new Map();

    constructor(private config: ProxyConfig) {
        this.initializeFreeTrialUsage();
    }

    private initializeFreeTrialUsage(): void {
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

    getFreeTrialStatus(userId?: string): FreeTrialStatus {
        if (!userId) {
            return this.getDefaultFreeTrialStatus();
        }

        const usage = this.getOrCreateUsage(userId);
        return {
            optedInToFreeTrial: usage.optedInToFreeTrial,
            chatCount: usage.chatCount,
            autocompleteCount: usage.autocompleteCount,
            chatLimit: this.config.freeTrialSettings.chatLimit,
            autocompleteLimit: this.config.freeTrialSettings.autocompleteLimit
        };
    }

    updateFreeTrialUsage(userId: string, chatIncrement = 0, autocompleteIncrement = 0): void {
        const usage = this.freeTrialUsage.get(userId);
        if (usage) {
            usage.chatCount += chatIncrement;
            usage.autocompleteCount += autocompleteIncrement;
            this.freeTrialUsage.set(userId, usage);
        }
    }

    private getDefaultFreeTrialStatus(): FreeTrialStatus {
        return {
            optedInToFreeTrial: this.config.freeTrialSettings.defaultOptIn,
            chatCount: 0,
            autocompleteCount: 0,
            chatLimit: this.config.freeTrialSettings.chatLimit,
            autocompleteLimit: this.config.freeTrialSettings.autocompleteLimit
        };
    }

    private getOrCreateUsage(userId: string): FreeTrialUsage {
        let usage = this.freeTrialUsage.get(userId);
        if (!usage) {
            usage = {
                userId,
                optedInToFreeTrial: this.config.freeTrialSettings.defaultOptIn,
                chatCount: 0,
                autocompleteCount: 0,
                lastResetDate: new Date().toISOString()
            };
            this.freeTrialUsage.set(userId, usage);
        }
        return usage;
    }
}

/**
 * Optimized In-memory storage implementation for Continue.dev platform data
 * Follows SOLID principles with separation of concerns and dependency injection
 */
export class InMemoryStorage implements IStorage {
    private readonly secretResolutionManager: SecretResolutionManager;
    private readonly templateProcessor: SecretTemplateProcessor;
    private readonly assistantProcessor: AssistantConfigProcessor;
    private readonly entityLookup: EntityLookupService;
    private readonly freeTrialManager: FreeTrialManager;

    constructor(private readonly config: ProxyConfig) {
        // Dependency injection following Dependency Inversion Principle
        this.secretResolutionManager = new SecretResolutionManager(config);
        this.templateProcessor = new SecretTemplateProcessor(
            (fqsn, orgScopeId) => this.secretResolutionManager.resolveSingleSecret(fqsn, orgScopeId)
        );
        this.assistantProcessor = new AssistantConfigProcessor(config, this.templateProcessor);
        this.entityLookup = new EntityLookupService(config);
        this.freeTrialManager = new FreeTrialManager(config);
    }

    async resolveSecrets(fqsns: FQSN[], orgScopeId: string | null): Promise<(SecretResult | undefined)[]> {
        return Promise.all(fqsns.map(fqsn =>
            this.secretResolutionManager.resolveSingleSecret(fqsn, orgScopeId)
        ));
    }

    async listAssistants(organizationId?: string | null, alwaysUseProxy?: boolean): Promise<AssistantInfo[]> {
        const assistants = this.getFilteredAssistants(organizationId);
        return this.assistantProcessor.processAssistants(assistants, organizationId || null, alwaysUseProxy);
    }

    async listAssistantFullSlugs(organizationId?: string | null): Promise<FullSlug[]> {
        const assistants = this.getFilteredAssistants(organizationId);
        return assistants.map(assistant =>
            `${assistant.ownerSlug}/${assistant.packageSlug}@${assistant.version}`
        );
    }

    async listOrganizations(userId?: string): Promise<OrganizationDescription[]> {
        if (!userId) {
            return this.getAllOrganizations();
        }

        return this.getUserOrganizations(userId);
    }

    async getFreeTrialStatus(userId?: string): Promise<FreeTrialStatus> {
        return this.freeTrialManager.getFreeTrialStatus(userId);
    }

    async updateFreeTrialUsage(userId: string, chatIncrement = 0, autocompleteIncrement = 0): Promise<void> {
        this.freeTrialManager.updateFreeTrialUsage(userId, chatIncrement, autocompleteIncrement);
    }

    getSecretValue(secretLocation: SecretLocation): string | undefined {
        const secretStores = {
            user: this.config.secrets.user,
            organization: this.config.secrets.organization,
            models_add_on: this.config.secrets.modelsAddOn,
            free_trial: this.config.secrets.freeTrial
        };

        const store = secretStores[secretLocation.secretType as keyof typeof secretStores];
        if (!store) return undefined;

        const key = this.getSecretStoreKey(secretLocation);
        const secretBlock = store[key];

        return secretBlock?.secrets[secretLocation.secretName];
    }

    private getFilteredAssistants(organizationId?: string | null): AssistantConfig[] {
        if (!organizationId) {
            return this.config.assistants;
        }

        return this.entityLookup.filterAssistantsByOrganization(this.config.assistants, organizationId);
    }

    private getAllOrganizations(): OrganizationDescription[] {
        return this.config.organizations.map(org => ({
            id: org.id,
            iconUrl: org.iconUrl,
            name: org.name,
            slug: org.slug
        }));
    }

    private getUserOrganizations(userId: string): OrganizationDescription[] {
        const user = this.entityLookup.findUserById(userId);
        if (!user) return [];

        const userOrgs: OrganizationDescription[] = [];
        for (const orgId of user.organizations) {
            const org = this.entityLookup.findOrganizationById(orgId);
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

    private getSecretStoreKey(secretLocation: SecretLocation): string {
        switch (secretLocation.secretType) {
            case 'user':
                return secretLocation.userSlug || '';
            case 'organization':
                return secretLocation.orgSlug || '';
            case 'models_add_on':
            case 'free_trial':
                return secretLocation.blockSlug || '';
            default:
                return '';
        }
    }
}
