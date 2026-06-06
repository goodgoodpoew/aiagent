export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  openaiApiKey: process.env.OPENAI_API_KEY,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  claudeApiKey: process.env.CLAUDE_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  modelCredentialSecret: process.env.MODEL_CREDENTIAL_SECRET,

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'aiproxy:',
  },

  cache: {
    chatTtl: parseInt(process.env.CACHE_TTL_CHAT ?? '300', 10),
    sessionTtl: parseInt(process.env.CACHE_TTL_SESSION ?? '3600', 10),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
  },

  files: {
    /** 单文件最大字节数，默认 10 MB */
    maxFileSize: parseInt(process.env.FILE_MAX_SIZE ?? String(10 * 1024 * 1024), 10),
    /** 单条消息最大附件数 */
    maxAttachmentsPerMessage: parseInt(process.env.FILE_MAX_ATTACHMENTS_PER_MESSAGE ?? '5', 10),
  },
});
