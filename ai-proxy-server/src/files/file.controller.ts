import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Res,
  Headers,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Logger,
  StreamableFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FileService } from './file.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { SkipResponseEnvelope } from '../common/response/skip-response-envelope.decorator';
import { QueryFileDto } from './dto/query-file.dto';

@Controller('/api/files')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(private readonly fileService: FileService) {}

  /**
   * 查询当前用户文件列表
   */
  @Get()
  async findAll(@Headers('x-user-id') userId: string, @Query() query: QueryFileDto) {
    if (!userId) {
      return { files: [], cursor: null };
    }
    return this.fileService.findAll(userId, query);
  }

  /**
   * 上传文件
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-user-id') userId: string,
    @Body('purpose') purpose?: string,
    @Body('displayName') displayName?: string,
    @Headers('x-file-name') fileNameHeader?: string,
  ) {
    if (!file) {
      throw new AppException({ code: ErrorCode.FILE_REQUIRED });
    }

    return this.fileService.upload(
      file,
      userId || 'anonymous',
      purpose || 'chat',
      displayName,
      fileNameHeader,
    );
  }

  /**
   * 查询文件元数据
   */
  @Get(':id')
  async getDetail(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    return this.fileService.findById(id, userId || undefined);
  }

  /**
   * 读取文件解析内容
   */
  @Get(':id/content')
  async getContent(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    return this.fileService.getContent(id, userId || undefined);
  }

  /**
   * 下载原始文件
   */
  @Get(':id/download')
  @SkipResponseEnvelope()
  async download(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, name, mimeType } = await this.fileService.downloadStream(
      id,
      userId || undefined,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);

    return new StreamableFile(stream);
  }

  /**
   * 删除文件（软删除）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    await this.fileService.softDelete(id, userId || undefined);
  }
}
