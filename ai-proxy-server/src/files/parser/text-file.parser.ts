import { Injectable, Logger } from '@nestjs/common';
import {
  FileParser,
  UploadedFileMeta,
  ParseFileInput,
  ParsedFileContent,
} from './file-parser.interface';

/**
 * 文本文件解析器
 *
 * 支持 txt / md / json / csv 等纯文本格式。
 */
@Injectable()
export class TextFileParser implements FileParser {
  private readonly logger = new Logger(TextFileParser.name);

  private readonly supportedMimes = new Set([
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'text/csv',
    'application/json',
  ]);

  supports(file: UploadedFileMeta): boolean {
    if (this.supportedMimes.has(file.type)) {
      return true;
    }
    const ext = file.extension?.toLowerCase();
    if (ext && ['txt', 'md', 'csv', 'json'].includes(ext)) {
      return true;
    }
    return false;
  }

  async parse(input: ParseFileInput): Promise<ParsedFileContent> {
    const text = input.buffer.toString('utf-8');
    const tokenEstimate = Math.ceil(text.length / 4);

    let metadata: Record<string, unknown> = {};
    if (input.meta.type === 'application/json' || input.meta.extension === 'json') {
      try {
        const parsed = JSON.parse(text);
        metadata = { jsonParsed: true };
        this.logger.debug(`JSON 解析成功: ${input.meta.name}`);
      } catch {
        metadata = { jsonParsed: false };
        this.logger.warn(`JSON 解析失败，按原始文本处理: ${input.meta.name}`);
      }
    }

    if (input.meta.type === 'text/csv' || input.meta.extension === 'csv') {
      const lines = text.split('\n').filter((l) => l.trim());
      const header = lines[0]?.split(',').length ?? 0;
      metadata = { csvLines: lines.length, csvColumns: header };
    }

    return { text, tokenEstimate, metadata };
  }
}
