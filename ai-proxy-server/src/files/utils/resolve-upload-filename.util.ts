import { decodeUploadFilename } from './decode-upload-filename.util';

export interface ResolveUploadFilenameOptions {
  /** URL 编码的原始文件名（来自 X-File-Name 请求头，最可靠） */
  headerEncoded?: string;
  /** multipart 文本字段 displayName */
  displayName?: string;
}

/**
 * 解析上传文件的展示名：优先请求头，其次表单字段，最后 Multer originalname
 */
export function resolveUploadFilename(
  originalname: string,
  options?: ResolveUploadFilenameOptions,
): string {
  const encoded = options?.headerEncoded?.trim();
  if (encoded) {
    try {
      const fromHeader = decodeURIComponent(encoded);
      if (fromHeader) return fromHeader;
    } catch {
      // 忽略非法 URI 编码
    }
  }

  const fromField = options?.displayName?.trim();
  if (fromField) return decodeUploadFilename(fromField);

  return decodeUploadFilename(originalname);
}
