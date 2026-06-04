import { IsArray, IsString } from 'class-validator';

export class AttachSessionFilesDto {
  @IsArray()
  @IsString({ each: true })
  fileIds!: string[];
}
