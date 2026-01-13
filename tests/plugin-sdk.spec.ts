import { describe, it, expect } from 'vitest';
import { validateManifest, isPluginManifest } from '../src/platform/plugin-sdk';
import { PluginCapability } from '../src/platform/plugin-sdk/types';

const validManifest = {
  name: 'hello-world',
  version: '0.1.0',
  description: 'A test plugin',
  capabilities: [PluginCapability.METRICS, PluginCapability.READ_REPO],
  entrypoint: 'lib/index.js',
};

const invalidManifest = {
  name: '',
  version: '0.0.1',
  capabilities: ['unknown'],
  entrypoint: '',
};

describe('Plugin SDK manifest validation', () => {
  it('validates a correct manifest', () => {
    const r = validateManifest(validManifest);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(isPluginManifest(r.manifest)).toBe(true);
      expect(r.manifest.name).toBe('hello-world');
    }
  });

  it('rejects an invalid manifest', () => {
    const r = validateManifest(invalidManifest);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
});
