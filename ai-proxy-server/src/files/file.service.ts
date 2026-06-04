import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalFileStorage } from './storage/local-file.storage';
import { TextFileParser } from './parser/text-file.parser';
import { PdfParser } from './parser/pdf.parser';
import { FileReaderPort, ReadableFileContent } from './file-reader.port';
import { FileParser, ParsedFileContent } from './parser/file-parser.interface';
import { ALLOWED_MIMES, ALLOWED_EXTENSIONS } from './dto/file-upload.dto';
import { FileUploadVO, FileDetailVO } from './vo/file.upload.vo';
import { FileDbDelegate, FileRecord, FileRecordWithCounts } from './file-db.types';
import { resolveUploadFilename } from './utils/resolve-upload-filename.util';
import { QueryFileDto } from './dto/query-file.dto';
import { FileListItemVO, FileListVO } from './vo/file.upload.vo';

/**
 * 服务端生成的存储 key 前缀
 */
function generateStorageKey(ext: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = crypto.randomUUID().slice(0, 12);
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
  return `${date}/${id}${safeExt}`;
}

/**
 * 计算 Buffer 的 SHA-256 hash
 */
function computeHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

@Injectable()
export class FileService implements FileReaderPort {
  private readonly logger = new Logger(FileService.name);
  private readonly parsers: FileParser[];

  private readonly maxFileSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalFileStorage,
    textParser: TextFileParser,
    pdfParser: PdfParser,
    private readonly config: ConfigService,
  ) {
    this.parsers = [textParser, pdfParser];
    this.maxFileSize = this.config.get<number>('files.maxFileSize', 10 * 1024 * 1024);
  }

  /** 单条消息最大附件数（供聊天等模块校验） */
  get maxAttachmentsPerMessage(): number {
    return this.config.get<number>('files.maxAttachmentsPerMessage', 5);
  }

  /** 上传文件表访问 */
  private get fileDb(): FileDbDelegate {
    return (this.prisma as unknown as { uploadedFile: FileDbDelegate }).uploadedFile;
  }

  private toFileListItem(record: FileRecord | FileRecordWithCounts): FileListItemVO {
    const counts = (record as FileRecordWithCounts)._count;
    return {
      id: record.id,
      name: record.name,
      type: record.type,
      extension: record.extension ?? undefined,
      size: Number(record.size),
      status: record.status,
      purpose: record.purpose,
      hash: record.hash ?? undefined,
      metadata: record.metadata ?? undefined,
      url: record.url ?? `/api/files/${record.id}/download`,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      sessionCount: counts?.sessionLinks ?? 0,
      messageCount: counts?.messageLinks ?? 0,
    };
  }

  async findAll(userId: string, query: QueryFileDto): Promise<FileListVO> {
    const limit = Math.min(Number(query.limit) || 20, 100);
    const where: Prisma.UploadedFileWhereInput = {
      userId,
      isDeleted: false,
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
      ...(query.sessionId
        ? {
            sessionLinks: {
              some: {
                sessionId: query.sessionId,
                userId,
              },
            },
          }
        : {}),
    };

    const files = await this.fileDb.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        _count: {
          select: {
            sessionLinks: true,
            messageLinks: true,
          },
        },
      },
    });

    const hasMore = files.length > limit;
    const data = hasMore ? files.slice(0, limit) : files;

    return {
      files: data.map((file) => this.toFileListItem(file)),
      cursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
    };
  }

  /**
   * 上传文件
   */
  async upload(
    file: Express.Multer.File,
    userId: string,
    purpose = 'chat',
    displayName?: string,
    fileNameHeader?: string,
  ): Promise<FileUploadVO> {
    const fileName = resolveUploadFilename(file.originalname, {
      headerEncoded: fileNameHeader,
      displayName,
    });
    const extension = path.extname(fileName).toLowerCase();
    const mime = file.mimetype;

    // 校验 MIME 和扩展名
    if (!ALLOWED_MIMES.includes(mime) && !ALLOWED_EXTENSIONS.includes(extension.slice(1))) {
      throw new BadRequestException(
        `不支持的文件类型: ${mime}。当前仅支持 ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    // 校验大小
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `文件大小超过限制（最大 ${this.maxFileSize / 1024 / 1024} MB）`,
      );
    }

    const hash = computeHash(file.buffer);
    const storageKey = generateStorageKey(extension);

    // 写入本地存储
    await this.storage.save({
      storageKey,
      buffer: file.buffer,
      mimeType: mime,
    });

    // 解析文本内容
    let status = 'uploaded';
    let textContent: string | null = null;
    let parseMeta: Record<string, unknown> | null = null;

    const meta = {
      name: fileName,
      type: mime,
      extension: extension || undefined,
    };

    for (const parser of this.parsers) {
      if (parser.supports(meta)) {
        try {
          const parsed = await parser.parse({ buffer: file.buffer, meta });
          textContent = parsed.text;
          parseMeta = parsed.metadata ?? null;
          status = 'ready';
        } catch (err) {
          this.logger.warn(`文本解析失败: ${fileName}`, err);
          status = 'failed';
          parseMeta = { parseError: String(err) };
        }
        break;
      }
    }

    // 写入数据库
    const record = await this.fileDb.create({
      data: {
        userId,
        name: fileName,
        type: mime,
        extension: extension || null,
        size: file.size,
        hash,
        storageKey,
        status,
        purpose,
        textContent,
        metadata: (parseMeta as Prisma.InputJsonValue) ?? undefined,
      },
    });

    return {
      id: record.id,
      name: record.name,
      type: record.type,
      size: Number(record.size),
      status: record.status as FileUploadVO['status'],
      url: `/api/files/${record.id}/download`,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * 根据 ID 查询文件元数据
   */
  async findById(id: string, userId?: string): Promise<FileDetailVO> {
    const record = await this.fileDb.findFirst({
      where: { id, isDeleted: false, ...(userId ? { userId } : {}) },
    });
    if (!record) {
      throw new NotFoundException(`文件不存在: ${id}`);
    }

    return {
      id: record.id,
      name: record.name,
      type: record.type,
      extension: record.extension ?? undefined,
      size: Number(record.size),
      status: record.status,
      purpose: record.purpose,
      hash: record.hash ?? undefined,
      metadata: record.metadata ?? undefined,
      url: record.url ?? `/api/files/${record.id}/download`,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 获取文件解析后的文本内容
   */
  async getContent(id: string, userId?: string): Promise<{ text: string }> {
    const record = await this.fileDb.findFirst({
      where: { id, isDeleted: false, ...(userId ? { userId } : {}) },
    });
    if (!record) {
      throw new NotFoundException(`文件不存在: ${id}`);
    }

    if (record.textContent == null) {
      throw new BadRequestException(`该文件尚未解析或解析失败: ${id}`);
    }

    return { text: record.textContent };
  }

  /**
   * 下载原始文件流
   */
  async downloadStream(
    id: string,
    userId?: string,
  ): Promise<{
    stream: import('stream').Readable;
    name: string;
    mimeType: string;
  }> {
    const record = await this.fileDb.findFirst({
      where: { id, isDeleted: false, ...(userId ? { userId } : {}) },
    });
    if (!record) {
      throw new NotFoundException(`文件不存在: ${id}`);
    }

    const stream = await this.storage.read(record.storageKey);
    return { stream, name: record.name, mimeType: record.type };
  }

  /**
   * 软删除文件
   */
  async softDelete(id: string, userId?: string): Promise<void> {
    const record = await this.fileDb.findFirst({
      where: { id, isDeleted: false, ...(userId ? { userId } : {}) },
    });
    if (!record) {
      throw new NotFoundException(`文件不存在: ${id}`);
    }

    await this.fileDb.update({
      where: { id },
      data: { isDeleted: true },
    });

    // 异步清理存储文件（不阻塞删除响应）
    this.storage.remove(record.storageKey).catch((err) => {
      this.logger.warn(`清理存储文件失败: ${record.storageKey}`, err);
    });
  }

  // ───────── FileReaderPort 实现 ─────────

  /**
   * 批量读取文件内容，并返回不可读文件原因，供聊天消息 metadata 解释模型实际看到了什么。
   */
  async getReadableContentsDetailed(
    fileIds: string[],
    userId: string,
  ): Promise<{
    readable: ReadableFileContent[];
    unavailable: Array<{ fileId: string; reason: string }>;
  }> {
    if (!fileIds.length) return { readable: [], unavailable: [] };

    const uniqueIds = Array.from(new Set(fileIds.filter(Boolean)));
    const records = await this.fileDb.findMany({
      where: {
        id: { in: uniqueIds },
        isDeleted: false,
        userId,
      },
    });

    const resultMap = new Map(records.map((r) => [r.id, r] as const));
    const readable: ReadableFileContent[] = [];
    const unavailable: Array<{ fileId: string; reason: string }> = [];

    for (const id of uniqueIds) {
      const record = resultMap.get(id);
      if (!record) {
        unavailable.push({ fileId: id, reason: '文件不存在或无权限访问' });
        continue;
      }

      if (record.status !== 'ready' || record.textContent == null) {
        unavailable.push({ fileId: id, reason: '文件尚未解析成功，未进入本轮模型上下文' });
        continue;
      }

      readable.push({
        fileId: record.id,
        name: record.name,
        type: record.type,
        content: record.textContent,
        tokenEstimate: Math.ceil(record.textContent.length / 4),
      });
    }

    return { readable, unavailable };
  }

  /**
   * 批量读取文件可读内容，供聊天上下文构建使用
   */
  async getReadableContents(fileIds: string[], userId: string): Promise<ReadableFileContent[]> {
    const result = await this.getReadableContentsDetailed(fileIds, userId);
    return result.readable;
  }
}
