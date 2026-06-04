import { ErrorCode } from './error-code.enum';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.OK]: '请求成功',
  [ErrorCode.BAD_REQUEST]: '请求无法处理',
  [ErrorCode.VALIDATION_ERROR]: '请求参数有误，请检查后重试',
  [ErrorCode.UNAUTHORIZED]: '请先登录后再操作',
  [ErrorCode.FORBIDDEN]: '当前账号无权执行该操作',
  [ErrorCode.NOT_FOUND]: '资源不存在或已被删除',
  [ErrorCode.CONFLICT]: '数据已存在，请勿重复提交',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试',
  [ErrorCode.INTERNAL_SERVER_ERROR]: '系统开小差了，请稍后重试',

  [ErrorCode.AI_PROVIDER_NOT_FOUND]: '模型供应商不存在或未启用',
  [ErrorCode.AI_MODEL_NOT_FOUND]: '模型不存在或未启用',
  [ErrorCode.AI_PROVIDER_NOT_CONFIGURED]: '模型供应商未配置，请联系管理员',
  [ErrorCode.AI_ADAPTER_UNSUPPORTED]: '当前模型适配器暂不支持',
  [ErrorCode.UPSTREAM_REJECTED]: '模型服务拒绝请求，请稍后重试',
  [ErrorCode.UPSTREAM_UNAVAILABLE]: '模型服务暂时不可用',
  [ErrorCode.UPSTREAM_NETWORK_ERROR]: '无法连接模型服务',

  [ErrorCode.SESSION_NOT_FOUND]: '会话不存在或已被删除',
  [ErrorCode.SESSION_CREATE_FAILED]: '会话创建失败，请稍后重试',
  [ErrorCode.MESSAGE_CREATE_FAILED]: '消息保存失败，请稍后重试',

  [ErrorCode.FILE_REQUIRED]: '请先选择要上传的文件',
  [ErrorCode.FILE_NOT_FOUND]: '文件不存在或已被删除',
  [ErrorCode.FILE_TOO_LARGE]: '文件大小超过限制',
  [ErrorCode.FILE_TYPE_UNSUPPORTED]: '不支持的文件类型',
  [ErrorCode.FILE_PARSE_FAILED]: '文件解析失败，请更换文件后重试',

  [ErrorCode.PROVIDER_NAME_DUPLICATED]: '供应商名称已存在',
  [ErrorCode.CREDENTIAL_INVALID]: '模型供应商凭据无效',
  [ErrorCode.MODEL_NAME_DUPLICATED]: '模型名称已存在',
};

export function getErrorMessage(code: ErrorCode, fallback?: string): string {
  return fallback || ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrorCode.INTERNAL_SERVER_ERROR];
}
