import { Readable } from 'stream';

/**
 * 写入存储的文件信息
 */
export interface SaveFileInput {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
}

/**
 * 存储后返回的文件信息
 */
export interface StoredFile {
  storageKey: string;
  size: number;
}

/**
 * 文件存储抽象接口
 *
 * 当前提供本地磁盘实现，后续可扩展 S3/MinIO/COS 等对象存储。
 */
export interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFile>;
  read(storageKey: string): Promise<Readable>;
  remove(storageKey: string): Promise<void>;
}
