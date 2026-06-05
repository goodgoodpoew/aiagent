/**
 * 文件可读内容
 */
export interface ReadableFileContent {
  fileId: string;
  name: string;
  type: string;
  content: string;
  tokenEstimate?: number;
}

export interface UnavailableFileContent {
  fileId: string;
  name?: string;
  type?: string;
  reason: string;
}

/**
 * 文件读取端口
 *
 * FileModule 提供实现，聊天上下文构建时只依赖此窄接口。
 */
export interface FileReaderPort {
  getReadableContents(fileIds: string[], userId: string): Promise<ReadableFileContent[]>;
}
