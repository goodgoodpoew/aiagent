-- AlterTable
ALTER TABLE "model_providers" RENAME CONSTRAINT "platforms_pkey" TO "model_providers_pkey";

-- AlterTable
ALTER TABLE "provider_models" RENAME CONSTRAINT "platform_models_pkey" TO "provider_models_pkey";

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "extension" TEXT,
    "size" BIGINT NOT NULL,
    "hash" TEXT,
    "storage_key" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "purpose" TEXT NOT NULL DEFAULT 'chat',
    "text_content" TEXT,
    "metadata" JSONB,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "files_user_id_created_at_idx" ON "files"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "files_hash_idx" ON "files"("hash");

-- CreateIndex
CREATE INDEX "files_status_idx" ON "files"("status");
