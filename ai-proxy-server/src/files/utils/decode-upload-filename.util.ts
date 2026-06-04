/**
 * 修复 Multer/Busboy 将 UTF-8 文件名按 latin1 解析导致的乱码
 */
export function decodeUploadFilename(raw: string): string {
  if (!raw) return raw;

  // 已含中文等字符，说明编码正常
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(raw)) {
    return raw;
  }

  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  if (
    decoded !== raw &&
    /[\u4e00-\u9fff\u3400-\u4dbf]/.test(decoded) &&
    !decoded.includes('\uFFFD')
  ) {
    return decoded;
  }

  return raw;
}
