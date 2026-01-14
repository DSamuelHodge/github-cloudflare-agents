/**
 * Phase 5: Plugin Manifest Validation
 *
 * Defines the structure and validation for plugin manifests.
 * Enforces capability declarations and safety constraints.
 */

import { z } from 'zod';

/**
 * Plugin capability declarations
 */
export enum PluginCapability {
  NETWORK_ACCESS = 'network_access',
  SECRET_ACCESS = 'secret_access',
  FILE_SYSTEM_READ = 'file_system_read',
  FILE_SYSTEM_WRITE = 'file_system_write',
  EXECUTE_COMMANDS = 'execute_commands',
  DATABASE_ACCESS = 'database_access',
}

/**
 * Plugin manifest schema
 */
export const PluginManifestSchema = z.object({
  name: z.string().min(1).max(50),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(200),
  author: z.string().min(1).max(100),

  // Entry point
  entryPoint: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),

  // Required capabilities (least privilege)
  capabilities: z.array(z.nativeEnum(PluginCapability)).max(5),

  // Resource limits
  resourceLimits: z.object({
    maxExecutionTimeMs: z.number().min(100).max(10000).default(2000),
    maxMemoryMb: z.number().min(1).max(50).default(10),
    maxConcurrentExecutions: z.number().min(1).max(10).default(1),
  }),

  // Metadata
  metadata: z.object({
    repository: z.string().url().optional(),
    license: z.string().optional(),
    tags: z.array(z.string()).max(10).optional(),
  }).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Runtime API available to plugins
 */
export interface RuntimeApi {
  // Logging (safe, redacted)
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;

  // Configuration access (read-only, filtered)
  getConfig: (key: string) => string | undefined;

  // Time utilities
  now: () => number;
  sleep: (ms: number) => Promise<void>;

  // Utility functions
  validateInput: (input: unknown, schema: z.ZodSchema) => boolean;
}

/**
 * Validate plugin manifest
 */
export function validateManifest(manifest: unknown): { success: true; data: PluginManifest } | { success: false; error: string } {
  const result = PluginManifestSchema.safeParse(manifest);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ') };
  }
}

/**
 * Check if manifest declares required capability
 */
export function hasCapability(manifest: PluginManifest, capability: PluginCapability): boolean {
  return manifest.capabilities.includes(capability);
}

/**
 * Get safe runtime API for plugin execution
 */
export function createRuntimeApi(
  manifest: PluginManifest,
  logger: (level: string, message: string, meta?: Record<string, unknown>) => void,
  config: Record<string, string>
): RuntimeApi {
  return {
    log: (level, message, meta) => {
      // Redact sensitive information from logs
      const redactedMessage = redactSecrets(message);
      const redactedMeta = meta ? redactSecretsInObject(meta) : undefined;
      logger(level, redactedMessage, redactedMeta);
    },

    getConfig: (key) => {
      // Only allow access to non-sensitive config keys
      if (isSensitiveKey(key)) {
        throw new Error(`Access denied: ${key} is a sensitive configuration key`);
      }
      return config[key];
    },

    now: () => Date.now(),

    sleep: async (ms) => {
      if (ms > manifest.resourceLimits.maxExecutionTimeMs) {
        throw new Error(`Sleep duration ${ms}ms exceeds maximum execution time ${manifest.resourceLimits.maxExecutionTimeMs}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, ms));
    },

    validateInput: (input, schema) => {
      return schema.safeParse(input).success;
    },
  };
}

/**
 * Redact secrets from string content
 */
function redactSecrets(content: string): string {
  // Redact common secret patterns
  return content
    .replace(/\b[A-Za-z0-9+/=]{32,}\b/g, '[REDACTED_TOKEN]') // API keys, tokens
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]') // Emails
    .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[REDACTED_CC]') // Credit cards
    .replace(/\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/g, '[REDACTED_SSN]'); // SSN-like patterns
}

/**
 * Redact secrets from object values
 */
function redactSecretsInObject(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      redacted[key] = redactSecrets(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecretsInObject(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Check if a configuration key is sensitive
 */
function isSensitiveKey(key: string): boolean {
  const sensitiveKeys = [
    'token', 'secret', 'password', 'key', 'api_key', 'auth',
    'credential', 'private', 'access_token', 'refresh_token'
  ];

  return sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive));
}
