/**
 * Global Phase 3 Analytics instance
 */

import { Phase3Analytics } from './phase3';
import type { AgentLogger } from '../../types/agents';

let globalPhase3Analytics: Phase3Analytics | null = null;

export function getGlobalPhase3Analytics(logger?: AgentLogger): Phase3Analytics {
  if (!globalPhase3Analytics) {
    if (!logger) {
      throw new Error('Logger required to initialize Phase3Analytics');
    }
    globalPhase3Analytics = new Phase3Analytics(logger);
  }
  return globalPhase3Analytics;
}

export function resetPhase3Analytics(): void {
  if (globalPhase3Analytics) {
    globalPhase3Analytics.reset();
  }
}
