import { Prisma } from '@prisma/client';

/** 与 Prisma UploadedFile 模型对应的记录类型 */
export type FileRecord = {
  id: string;
  userId: string | null;
  name: string;
  type: string;
  extension: string | null;
  size: bigint;
  hash: string | null;
  storageKey: string;
  url: string | null;
  status: string;
  purpose: string;
  textContent: string | null;
  metadata: Prisma.JsonValue | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type FileRecordWithCounts = FileRecord & {
  _count?: {
    sessionLinks?: number;
    messageLinks?: number;
  };
};

/** 文件表 Prisma 委托（窄接口，避免 PrismaClient 类型缓存问题） */
export interface FileDbDelegate {
  create(args: { data: Prisma.UploadedFileCreateInput }): Promise<FileRecord>;
  findFirst(args: { where: Prisma.UploadedFileWhereInput }): Promise<FileRecord | null>;
  findMany(args: {
    where: Prisma.UploadedFileWhereInput;
    orderBy?: Prisma.UploadedFileOrderByWithRelationInput;
    take?: number;
    include?: Prisma.UploadedFileInclude;
  }): Promise<FileRecordWithCounts[]>;
  update(args: {
    where: Prisma.UploadedFileWhereUniqueInput;
    data: Prisma.UploadedFileUpdateInput;
  }): Promise<FileRecord>;
}

/** 会话-文件关联表 Prisma 委托 */
export interface SessionFileDbDelegate {
  createMany(args: Prisma.SessionFileCreateManyArgs): Prisma.PrismaPromise<Prisma.BatchPayload>;
}

/** 消息-文件关联表 Prisma 委托 */
export interface MessageFileDbDelegate {
  createMany(args: Prisma.MessageFileCreateManyArgs): Prisma.PrismaPromise<Prisma.BatchPayload>;
}
