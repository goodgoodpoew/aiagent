import { IsOptional, IsString, IsIn } from 'class-validator';

export const ALLOWED_PURPOSES = ['chat', 'avatar', 'knowledge'] as const;
export type FilePurpose = (typeof ALLOWED_PURPOSES)[number];

export const ALLOWED_MIMES: string[] = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/pdf',
];

export const ALLOWED_EXTENSIONS: string[] = ['txt', 'md', 'csv', 'json', 'pdf'];

/**
 * 文件上传请求体
 */
export class FileUploadDto {
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_PURPOSES)
  purpose?: FilePurpose;
}
