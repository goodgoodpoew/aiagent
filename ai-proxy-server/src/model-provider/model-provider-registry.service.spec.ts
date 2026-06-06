import { BadRequestException } from '@nestjs/common';
import { ModelProviderRegistryService } from './model-provider-registry.service';
import { testProvider } from '../../test/fixtures/providers.fixture';

function createRegistry() {
  const providerService = {
    findAllEnabledRaw: jest.fn(),
    findRawByName: jest.fn(),
    decryptCredentialConfig: jest.fn(),
    resolveBaseUrl: jest.fn(),
    resolveApiKey: jest.fn(),
  };
  const redis = {
    getJson: jest.fn(),
    setJson: jest.fn(),
    del: jest.fn(),
  };
  return {
    providerService,
    redis,
    registry: new ModelProviderRegistryService(providerService as any, redis as any),
  };
}

describe('ModelProviderRegistryService', () => {
  it('resolves custom providers without touching DB or Redis', async () => {
    const { registry, providerService, redis } = createRegistry();

    const resolved = await registry.resolveChatProvider({
      provider: 'custom',
      model: 'custom-model',
      customBaseUrl: 'http://localhost:3999/v1///',
      customApiKey: 'test-only',
    });

    expect(resolved).toMatchObject({
      provider: 'custom',
      model: 'custom-model',
      baseUrl: 'http://localhost:3999/v1',
      apiKey: 'test-only',
      adapterType: 'openai-compatible',
    });
    expect(providerService.findAllEnabledRaw).not.toHaveBeenCalled();
    expect(redis.getJson).not.toHaveBeenCalled();
  });

  it('fails fast when no configured provider is available', async () => {
    const { registry, redis, providerService } = createRegistry();
    redis.getJson.mockResolvedValue(null);
    providerService.findAllEnabledRaw.mockResolvedValue([]);

    await expect(registry.resolveProvider()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves default provider, model and credential from registry data', async () => {
    const { registry, redis, providerService } = createRegistry();
    redis.getJson.mockResolvedValue(null);
    providerService.findAllEnabledRaw.mockResolvedValue([
      {
        ...testProvider,
        enabled: true,
        credentials: [{ id: 'cred_1', enabled: true }],
        models: [{ name: 'gpt-test', displayName: 'GPT Test', modelType: 'llm', isDefault: true }],
      },
    ]);
    providerService.findRawByName.mockResolvedValue({
      ...testProvider,
      enabled: true,
      credentials: [{ id: 'cred_1', enabled: true, isDefault: true, encryptedConfig: 'secret' }],
      models: [{ name: 'gpt-test', displayName: 'GPT Test', modelType: 'llm', isDefault: true }],
    });
    providerService.decryptCredentialConfig.mockReturnValue({ apiKey: 'test-only' });
    providerService.resolveBaseUrl.mockReturnValue('http://localhost:3999/v1');
    providerService.resolveApiKey.mockReturnValue('test-only');

    const resolved = await registry.resolveChatProvider({});

    expect(resolved).toMatchObject({
      provider: testProvider.name,
      model: 'gpt-test',
      credentialId: 'cred_1',
      baseUrl: 'http://localhost:3999/v1',
      apiKey: 'test-only',
    });
    expect(redis.setJson).toHaveBeenCalled();
  });
});
