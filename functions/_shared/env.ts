export interface Env {
  DATABASE_URL: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET?: string;
}

export function getSessionSecret(env: Env): string {
  return env.SESSION_SECRET ?? `${env.ADMIN_PASSWORD}:gmc-session-v1`;
}
