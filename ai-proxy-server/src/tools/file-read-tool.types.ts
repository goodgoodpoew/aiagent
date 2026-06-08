import type { ReadableFileContent, UnavailableFileContent } from '@/files/file-reader.port';

export const READ_ATTACHED_FILES_TOOL_NAME = 'read_attached_files';

export interface AttachmentReadResult {
  fileId: string;
  name: string;
  mimeType?: string;
  tokenEstimate?: number;
  status: 'done' | 'failed';
  reason?: string;
}

export interface FileReadToolArguments {
  fileIds: string[];
  userId: string;
}

export interface FileReadToolResult {
  readable: ReadableFileContent[];
  unavailable: UnavailableFileContent[];
  readableFileIds: string[];
  attachmentContext: string;
  attachments: Array<{
    fileId: string;
    name: string;
    type: string;
    status: 'ready';
    tokenEstimate?: number;
  }>;
  readResults: AttachmentReadResult[];
}

export function buildAttachmentContext(files: ReadableFileContent[]): string {
  if (!files.length) return '';

  const blocks = files.map(
    (file) => `<file id="${file.fileId}" name="${file.name}" type="${file.type}">\n${file.content}\n</file>`,
  );

  return `用户随消息附带了以下文件内容，请只在相关时引用：\n\n${blocks.join('\n\n')}`;
}

export function isFileReadToolResult(value: unknown): value is FileReadToolResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<FileReadToolResult>;
  return Array.isArray(result.readable)
    && Array.isArray(result.unavailable)
    && Array.isArray(result.readableFileIds)
    && Array.isArray(result.attachments)
    && Array.isArray(result.readResults)
    && typeof result.attachmentContext === 'string';
}
