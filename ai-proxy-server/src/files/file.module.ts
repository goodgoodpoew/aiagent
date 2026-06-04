import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { LocalFileStorage } from './storage/local-file.storage';
import { TextFileParser } from './parser/text-file.parser';
import { PdfParser } from './parser/pdf.parser';

/**
 * 文件上传模块
 *
 * 负责文件上传、存储、解析、读取和删除。
 * 通过 FileReaderPort 向聊天模块提供解析后的文本内容。
 */
@Module({
  imports: [
    PrismaModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>('files.maxFileSize', 10 * 1024 * 1024),
        },
      }),
    }),
  ],
  controllers: [FileController],
  providers: [FileService, LocalFileStorage, TextFileParser, PdfParser],
  exports: [FileService],
})
export class FileModule {}
