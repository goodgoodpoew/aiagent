/**
 * 文件上传返回 VO
 */
export class FileUploadVO {
  id: string;
  name: string;
  type: string;
  size: number;
  status: 'uploaded' | 'parsing' | 'ready' | 'failed';
  url?: string;
  createdAt: string;
}

/**
 * 文件详情 VO
 */
export class FileDetailVO {
  id: string;
  name: string;
  type: string;
  extension?: string;
  size: number;
  status: string;
  purpose: string;
  hash?: string;
  metadata?: unknown;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 文件列表项 VO
 */
export class FileListItemVO extends FileDetailVO {
  sessionCount: number;
  messageCount: number;
}

/**
 * 文件分页列表 VO
 */
export class FileListVO {
  files: FileListItemVO[];
  cursor: string | null;
}
