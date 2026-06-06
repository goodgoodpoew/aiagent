import { ConfigService } from '@nestjs/config';
import { CredentialCryptoService } from './credential-crypto.service';

describe('CredentialCryptoService', () => {
  it('encrypts, decrypts and masks provider credentials', () => {
    const service = new CredentialCryptoService({
      get: jest.fn((key: string) =>
        key === 'modelCredentialSecret' ? 'unit-test-secret' : undefined,
      ),
    } as unknown as ConfigService);

    const encrypted = service.encrypt({ apiKey: 'test-only', baseUrl: 'http://localhost:3999/v1' });

    expect(encrypted).not.toContain('test-only');
    expect(service.decrypt(encrypted)).toEqual({
      apiKey: 'test-only',
      baseUrl: 'http://localhost:3999/v1',
    });
    expect(service.mask(service.decrypt(encrypted))).toEqual({
      apiKey: '********',
      baseUrl: 'http://localhost:3999/v1',
    });
  });
});
