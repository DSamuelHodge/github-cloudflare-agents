// Phase 5 Plugin Manifest Validation
import type { PluginManifest } from './runtime';

export function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (typeof manifest !== 'object' || manifest === null) return false;
  const m = manifest as Record<string, unknown>;
  return (
    typeof m.name === 'string' &&
    Array.isArray(m.capabilities) &&
    typeof m['entry'] === 'string' &&
    typeof m['checksum'] === 'string'
  );
}
