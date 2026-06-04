export interface ApiResponse<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
  traceId: string;
  timestamp: string;
  path: string;
  error?: {
    details?: unknown;
  };
}

export function isApiResponse(value: unknown): value is ApiResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ApiResponse>;
  return (
    typeof candidate.success === 'boolean' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    'data' in candidate
  );
}
