export const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';
export const DEFAULT_USER_ID = '9a74c501-9d60-441b-b1ba-7b3eb469dce0';
export const AUTH_TOKEN_STORAGE_KEY = 'aiagent.auth.token';
export const AUTH_USER_STORAGE_KEY = 'aiagent.auth.user';

export interface StoredAuthUser {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
}

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

function readLocalStorage(key: string): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem(key) || undefined;
}

function writeLocalStorage(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}

function removeLocalStorage(key: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
}

export function getAuthToken() {
  return readLocalStorage(AUTH_TOKEN_STORAGE_KEY);
}

export function getStoredAuthUser(): StoredAuthUser | undefined {
  const raw = readLocalStorage(AUTH_USER_STORAGE_KEY);
  if (!raw) return undefined;

  try {
    const user = JSON.parse(raw) as StoredAuthUser;
    return user?.id ? user : undefined;
  } catch {
    return undefined;
  }
}

export function saveAuthSession(token: string, user: StoredAuthUser) {
  writeLocalStorage(AUTH_TOKEN_STORAGE_KEY, token);
  writeLocalStorage(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  removeLocalStorage(AUTH_TOKEN_STORAGE_KEY);
  removeLocalStorage(AUTH_USER_STORAGE_KEY);
}

export function hasAuthSession() {
  return Boolean((getAuthToken() && getStoredAuthUser()) || readEnvValue('UMI_APP_USER_ID'));
}

export function getUserId() {
  return getStoredAuthUser()?.id || readEnvValue('UMI_APP_USER_ID') || DEFAULT_USER_ID;
}

export function buildAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    'X-User-Id': getUserId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
