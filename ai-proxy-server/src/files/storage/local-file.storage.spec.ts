import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalFileStorage } from './local-file.storage';

describe('LocalFileStorage', () => {
  let uploadRoot: string;

  beforeEach(async () => {
    uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aiagent-upload-root-'));
  });

  afterEach(async () => {
    await fs.rm(uploadRoot, { recursive: true, force: true });
  });

  function createStorage() {
    return new LocalFileStorage({
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'files.uploadRoot') return uploadRoot;
        return fallback;
      }),
    } as any);
  }

  it('使用配置的 uploadRoot 保存和读取文件', async () => {
    const storage = createStorage();

    await storage.save({
      storageKey: '20260608/file.txt',
      buffer: Buffer.from('hello'),
      mimeType: 'text/plain',
    });

    await expect(fs.readFile(path.join(uploadRoot, '20260608/file.txt'), 'utf8')).resolves.toBe(
      'hello',
    );

    const stream = await storage.read('20260608/file.txt');
    expect(stream.readable).toBe(true);
  });

  it('拒绝逃逸 uploadRoot 的 storageKey', async () => {
    const storage = createStorage();

    await expect(
      storage.save({
        storageKey: '../escape.txt',
        buffer: Buffer.from('bad'),
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow('非法文件路径');
  });
});
