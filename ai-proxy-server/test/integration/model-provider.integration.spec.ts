import { ModelProviderRegistryService } from '../../src/model-provider/model-provider-registry.service';
import { ModelProviderService } from '../../src/model-provider/model-provider.service';
import {
  closeIntegrationApp,
  createIntegrationApp,
  resetIntegrationState,
  type IntegrationAppContext,
} from '../helpers/create-integration-app';

describe('model-provider integration', () => {
  let context: IntegrationAppContext;
  let providerService: ModelProviderService;
  let registry: ModelProviderRegistryService;

  beforeAll(async () => {
    context = await createIntegrationApp();
    providerService = context.app.get(ModelProviderService);
    registry = context.app.get(ModelProviderRegistryService);
  });

  beforeEach(async () => {
    await resetIntegrationState(context);
  });

  afterAll(async () => {
    await closeIntegrationApp(context);
  });

  it('creates provider credentials and models, then resolves the default chat provider', async () => {
    const provider = await providerService.create({
      name: 'integration-openai',
      displayName: 'Integration OpenAI',
      baseUrl: 'http://localhost:3999/v1///',
      providerType: 'custom',
      adapterType: 'openai-compatible',
      enabled: true,
    });

    const credential = await providerService.createCredential(provider.id, {
      name: 'default-key',
      config: {
        apiKey: 'test-only',
        baseUrl: 'http://localhost:3999/override///',
      },
      isDefault: true,
    });

    const model = await providerService.createModel(provider.id, {
      name: 'gpt-integration',
      displayName: 'GPT Integration',
      modelType: 'llm',
      isDefault: true,
      enabled: true,
    });

    expect(credential).toMatchObject({
      providerId: provider.id,
      name: 'default-key',
      isDefault: true,
      enabled: true,
      maskedConfig: {
        apiKey: '********',
        baseUrl: 'http://localhost:3999/override///',
      },
    });
    expect(model).toMatchObject({
      providerId: provider.id,
      name: 'gpt-integration',
      isDefault: true,
    });

    const resolved = await registry.resolveChatProvider({ provider: 'integration-openai' });
    expect(resolved).toMatchObject({
      provider: 'integration-openai',
      model: 'gpt-integration',
      credentialId: credential.id,
      baseUrl: 'http://localhost:3999/override',
      apiKey: 'test-only',
      adapterType: 'openai-compatible',
    });
  });

  it('caches enabled providers in Redis and can invalidate the registry cache', async () => {
    await providerService.create({
      name: 'cached-provider',
      displayName: 'Cached Provider',
      baseUrl: 'http://localhost:3999/v1',
      providerType: 'custom',
      adapterType: 'openai-compatible',
      enabled: true,
    });

    const providers = await registry.listEnabledProviders();
    expect(providers.map((provider) => provider.name)).toContain('cached-provider');
    expect(await context.redis.exists('registry:model-providers')).toBe(1);

    await registry.invalidateProviderCache();
    expect(await context.redis.exists('registry:model-providers')).toBe(0);
  });
});
