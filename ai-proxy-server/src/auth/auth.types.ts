export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
}

export interface RequestWithUser {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
}
