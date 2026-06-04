import { Injectable, Logger } from '@nestjs/common';
import pdfParse = require('pdf-parse');
import {
  FileParser,
  UploadedFileMeta,
  ParseFileInput,
  ParsedFileContent,
} from './file-parser.interface';

@Injectable()
export class PdfParser implements FileParser {
  private readonly logger = new Logger(PdfParser.name);

  supports(file: UploadedFileMeta): boolean {
    if (file.type === 'application/pdf') {
      return true;
    }
    const ext = file.extension?.toLowerCase();
    if (ext === 'pdf') {
      return true;
    }
    return false;
  }

  async parse(input: ParseFileInput): Promise<ParsedFileContent> {
    try {
      const data = await pdfParse(input.buffer);

      const text = data.text.trim();
      const tokenEstimate = Math.ceil(text.length / 4);

      this.logger.debug(
        `PDF 解析成功: ${input.meta.name}, 页数=${data.numpages}, 文本长度=${text.length}`,
      );

      return {
        text,
        tokenEstimate,
        metadata: {
          pages: data.numpages,
        },
      };
    } catch (error) {
      this.logger.error(`PDF 解析失败: ${input.meta.name}`, error);
      throw error;
    }
  }
}
