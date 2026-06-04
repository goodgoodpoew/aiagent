import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { CredentialConfig } from './model-provider.types';

interface EncryptedPayload {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

@Injectable()
export class CredentialCryptoService {
  private readonly logger = new Logger(CredentialCryptoService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const secret =
      this.config.get<string>('modelCredentialSecret') ||
      process.env.MODEL_CREDENTIAL_SECRET ||
      'dev-model-credential-secret';

    if (!process.env.MODEL_CREDENTIAL_SECRET) {
      this.logger.warn('未配置 MODEL_CREDENTIAL_SECRET，当前使用开发默认密钥加密模型凭据');
    }

    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  encrypt(config: CredentialConfig): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
    const payload: EncryptedPayload = {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  decrypt(encryptedConfig: string): CredentialConfig {
    const payload = JSON.parse(
      Buffer.from(encryptedConfig, 'base64').toString('utf8'),
    ) as EncryptedPayload;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const raw = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(raw) as CredentialConfig;
  }

  mask(config: CredentialConfig): Record<string, unknown> {
    return Object.entries(config).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
        acc[key] = value ? '********' : '';
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
  }
}
