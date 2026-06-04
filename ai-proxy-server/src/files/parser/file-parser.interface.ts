/**
 * 待解析文件的元信息
 */
export interface UploadedFileMeta {
  name: string;
  type: string;
  extension?: string;
}

/**
 * 文件解析输入
 */
export interface ParseFileInput {
  buffer: Buffer;
  meta: UploadedFileMeta;
}

/**
 * 解析结果
 */
export interface ParsedFileContent {
  text: string;
  tokenEstimate?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 文件解析器抽象接口
 */
export interface FileParser {
  supports(file: UploadedFileMeta): boolean;
  parse(input: ParseFileInput): Promise<ParsedFileContent>;
}
