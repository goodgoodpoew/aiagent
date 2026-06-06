import * as crypto from 'crypto';

export function encryptGrayCredential(config: Record<string, unknown>): string {
  const secret = process.env.MODEL_CREDENTIAL_SECRET || 'gray-model-credential-secret';
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);

  return Buffer.from(
    JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    }),
    'utf8',
  ).toString('base64');
}
