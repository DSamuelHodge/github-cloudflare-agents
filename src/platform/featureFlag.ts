import type { Env } from '../types/env';

export function isPhase5Enabled(env: Partial<Env>): boolean {
  const v = env.PHASE5_ENABLE;
  if (!v) return false;
  return String(v).toLowerCase() === 'true';
}
