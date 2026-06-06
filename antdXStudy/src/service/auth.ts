import {
  clearAuthSession,
  getApiBaseUrl,
  getAuthToken,
  getStoredAuthUser,
  saveAuthSession,
  type StoredAuthUser,
} from './config';
import { parseApiEnvelopeResponse } from './request';

export interface AuthResult {
  token: string;
  user: StoredAuthUser;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginPayload {
  account: string;
  password: string;
}

const authUrl = () => `${getApiBaseUrl()}/auth`;

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${authUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return parseApiEnvelopeResponse<T>(response);
}

function persistAuthResult(result: AuthResult): AuthResult {
  saveAuthSession(result.token, result.user);
  return result;
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  return persistAuthResult(await postAuth<AuthResult>('/login', payload));
}

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  return persistAuthResult(await postAuth<AuthResult>('/register', payload));
}

export async function fetchCurrentUser(): Promise<StoredAuthUser> {
  const response = await fetch(`${authUrl()}/me`, {
    headers: {
      Authorization: `Bearer ${getAuthToken() || ''}`,
    },
  });
  const user = await parseApiEnvelopeResponse<StoredAuthUser>(response);
  const token = getAuthToken();
  if (token) saveAuthSession(token, user);
  return user;
}

export function logout() {
  clearAuthSession();
}

export function getCurrentStoredUser() {
  return getStoredAuthUser();
}
