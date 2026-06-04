-- 为会话标题状态机和可见事件版本增加基础字段。
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "title_status" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- 请求幂等表：同一用户的同一个 request_id 只绑定一组会话/消息事实。
CREATE TABLE IF NOT EXISTS "chat_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "request_id" TEXT NOT NULL,
  "session_id" UUID NOT NULL,
  "user_message_id" UUID NOT NULL,
  "assistant_message_id" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "chat_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_requests_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_requests_user_id_request_id_key"
  ON "chat_requests"("user_id", "request_id");

CREATE INDEX IF NOT EXISTS "chat_requests_session_id_created_at_idx"
  ON "chat_requests"("session_id", "created_at");
