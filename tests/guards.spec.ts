import { describe, it, expect } from 'vitest';
import { assertExists } from '../src/utils/guards';

describe('assertExists', () => {
  it('does not throw for defined values', () => {
    expect(() => assertExists(123)).not.toThrow();
    expect(() => assertExists('ok')).not.toThrow();
    expect(() => assertExists({})).not.toThrow();
  });

  it('throws for null or undefined', () => {
    expect(() => assertExists(undefined as unknown as string)).toThrow('Expected value to be defined');
    expect(() => assertExists(null as unknown as number, 'missing')).toThrow('missing');
  });
});
