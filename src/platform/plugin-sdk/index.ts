import type { PluginManifest } from './types';
import { PluginCapability } from './types';

export function isPluginManifest(value: unknown): value is PluginManifest {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.name !== 'string' || m.name.length === 0) return false;
  if (typeof m.version !== 'string' || m.version.length === 0) return false;
  if (!Array.isArray(m.capabilities)) return false;
  // validate capabilities
  for (const cap of m.capabilities) {
    if (!Object.values(PluginCapability).includes(cap as PluginCapability)) return false;
  }
  if (typeof m.entrypoint !== 'string' || m.entrypoint.length === 0) return false;
  return true;
}

export function validateManifest(manifest: unknown): { valid: true; manifest: PluginManifest } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['manifest must be an object'] };
  }
  const m = manifest as Record<string, unknown>;
  if (typeof m.name !== 'string' || m.name.trim().length === 0) errors.push('name is required');
  if (typeof m.version !== 'string' || m.version.trim().length === 0) errors.push('version is required');
  if (!Array.isArray(m.capabilities)) errors.push('capabilities must be an array');
  else {
    for (const c of m.capabilities) {
      if (!Object.values(PluginCapability).includes(c as PluginCapability)) {
        errors.push(`unsupported capability: ${String(c)}`);
      }
    }
  }
  if (typeof m.entrypoint !== 'string' || m.entrypoint.trim().length === 0) errors.push('entrypoint is required');

  if (errors.length > 0) return { valid: false, errors };
  // m has already been validated; cast via unknown to satisfy TS
  return { valid: true, manifest: m as unknown as PluginManifest };
}
