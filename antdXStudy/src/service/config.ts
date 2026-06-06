export const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';
export const DEFAULT_USER_ID = '9a74c501-9d60-441b-b1ba-7b3eb469dce0';

function readEnvValue(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl() {
  return trimTrailingSlash(
    readEnvValue('UMI_APP_API_BASE_URL') || DEFAULT_API_BASE_URL,
  );
}

export function getUserId() {
  return readEnvValue('UMI_APP_USER_ID') || DEFAULT_USER_ID;
}
