import { describe, it, expect } from 'vitest';
import { isPhase5Enabled } from '../src/platform/featureFlag';

describe('Phase5 feature flag', () => {
  it('defaults to false when unset', () => {
    expect(isPhase5Enabled({})).toBe(false);
  });

  it('returns true for "true"', () => {
    expect(isPhase5Enabled({ PHASE5_ENABLE: 'true' })).toBe(true);
    expect(isPhase5Enabled({ PHASE5_ENABLE: 'True' })).toBe(true);
  });

  it('returns false for other values', () => {
    expect(isPhase5Enabled({ PHASE5_ENABLE: 'false' })).toBe(false);
    expect(isPhase5Enabled({ PHASE5_ENABLE: '0' })).toBe(false);
  });
});
