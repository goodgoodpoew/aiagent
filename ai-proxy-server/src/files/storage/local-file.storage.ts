import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { FileStorage, SaveFileInput, StoredFile } from './file-storage.interface';

/**
 * 本地磁盘文件存储适配器
 */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async save(input: SaveFileInput): Promise<StoredFile> {
    const filePath = path.join(this.uploadDir, input.storageKey);
    const parentDir = path.dirname(filePath);
    await fs.promises.mkdir(parentDir, { recursive: true });
    await fs.promises.writeFile(filePath, input.buffer);
    const stat = await fs.promises.stat(filePath);
    this.logger.log(`文件保存成功: ${input.storageKey}, 大小: ${stat.size}`);
    return {
      storageKey: input.storageKey,
      size: stat.size,
    };
  }

  read(storageKey: string): Promise<Readable> {
    const filePath = path.join(this.uploadDir, storageKey);
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${storageKey}`);
    }
    return Promise.resolve(fs.createReadStream(filePath));
  }

  async remove(storageKey: string): Promise<void> {
    const filePath = path.join(this.uploadDir, storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      this.logger.log(`文件已删除: ${storageKey}`);
    }
  }
}
