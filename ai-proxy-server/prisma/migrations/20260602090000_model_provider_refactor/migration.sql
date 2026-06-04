-- Rename the existing lightweight platform tables into Dify-like provider tables.
ALTER TABLE "platform_models" DROP CONSTRAINT IF EXISTS "platform_models_platform_id_fkey";

ALTER TABLE "platforms" RENAME TO "model_providers";
ALTER TABLE "platform_models" RENAME TO "provider_models";

ALTER INDEX IF EXISTS "platforms_name_key" RENAME TO "model_providers_name_key";
ALTER INDEX IF EXISTS "platform_models_platform_id_name_key" RENAME TO "provider_models_provider_id_model_type_name_key";

ALTER TABLE "model_providers" RENAME COLUMN "api_key_env" TO "legacy_api_key_env";
ALTER TABLE "provider_models" RENAME COLUMN "platform_id" TO "provider_id";

ALTER TABLE "model_providers"
  ADD COLUMN "provider_type" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "icon_url" TEXT,
  ADD COLUMN "adapter_type" TEXT NOT NULL DEFAULT 'openai-compatible',
  ADD COLUMN "system_built_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "config_schema" JSONB;

ALTER TABLE "provider_models"
  ADD COLUMN "model_type" TEXT NOT NULL DEFAULT 'llm',
  ADD COLUMN "features" JSONB,
  ADD COLUMN "context_size" INTEGER,
  ADD COLUMN "max_output" INTEGER,
  ADD COLUMN "default_parameters" JSONB,
  ADD COLUMN "pricing" JSONB,
  ADD COLUMN "deprecated" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS "provider_models_provider_id_model_type_name_key";
CREATE UNIQUE INDEX "provider_models_provider_id_model_type_name_key"
  ON "provider_models"("provider_id", "model_type", "name");
CREATE INDEX "provider_models_provider_id_model_type_is_default_idx"
  ON "provider_models"("provider_id", "model_type", "is_default");

CREATE TABLE "model_provider_credentials" (
  "id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "encrypted_config" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_validated_at" TIMESTAMP(3),
  "last_validation_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "model_provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_provider_credentials_provider_id_name_key"
  ON "model_provider_credentials"("provider_id", "name");
CREATE INDEX "model_provider_credentials_provider_id_is_default_idx"
  ON "model_provider_credentials"("provider_id", "is_default");

ALTER TABLE "provider_models"
  ADD CONSTRAINT "provider_models_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "model_providers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "model_provider_credentials"
  ADD CONSTRAINT "model_provider_credentials_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "model_providers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "model_providers"
SET
  "system_built_in" = true,
  "adapter_type" = CASE
    WHEN "name" = 'claude' THEN 'anthropic'
    WHEN "name" = 'gemini' THEN 'gemini'
    ELSE 'openai-compatible'
  END,
  "config_schema" = jsonb_build_object(
    'fields',
    jsonb_build_array(
      jsonb_build_object('name', 'apiKey', 'label', 'API Key', 'type', 'password', 'required', true),
      jsonb_build_object('name', 'baseUrl', 'label', 'Base URL', 'type', 'text', 'required', false)
    )
  );

ALTER TABLE "model_providers" DROP COLUMN "legacy_api_key_env";
