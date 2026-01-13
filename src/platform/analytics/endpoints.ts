/**
 * Phase 3.10: Analytics endpoints
 */

import type { Env } from '../../types/env';
import { createLogger } from '../../utils/logger';
import { getGlobalPhase3Analytics } from '../../platform/analytics';

/**
 * Handle GET /analytics/phase3
 * Returns Phase 3 analytics report
 */
export async function handlePhase3Analytics(
  env: Env,
  repositories?: Map<string, { fullName: string }>
): Promise<Response> {
  const logger = createLogger({ LOG_LEVEL: env.LOG_LEVEL || 'info' }, {
    component: 'Phase3Analytics',
  });

  try {
    const analytics = getGlobalPhase3Analytics(logger);
    const report = analytics.generateReport(repositories || new Map());

    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('Failed to generate Phase 3 analytics', error as Error);

    return new Response(
      JSON.stringify({
        error: 'Failed to generate analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
