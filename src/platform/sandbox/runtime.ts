/**
 * Phase 5: Sandbox Runtime Implementation
 *
 * Provides a conservative in-process sandbox for plugin execution.
 * Enforces manifest policies, resource limits, and audit logging.
 */

import type { PluginManifest, RuntimeApi } from './manifest';
import { PluginCapability } from './manifest';
import type { AuditService } from '../audit/AuditService';
import { isPhase5Enabled } from '../featureFlag';
import type { Env } from '../../types/env';

export interface SandboxOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  cpuLimitPct?: number;
  denyNetwork?: boolean;
  denySecrets?: boolean;
  config?: Record<string, string>;
}

export interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  auditEvents: Array<{
    timestamp: string;
    action: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>;
}

export type PluginEntry = (api: RuntimeApi, input?: unknown) => Promise<unknown> | unknown;

/**
 * Conservative in-process sandbox runtime
 */
export class SandboxRuntime {
  private auditEvents: ExecutionResult['auditEvents'] = [];

  constructor(
    private options: SandboxOptions = {},
    private auditService?: AuditService,
    private logger?: (level: string, message: string, meta?: Record<string, unknown>) => void,
    private env?: Partial<Env>
  ) {}

  /**
   * Execute a plugin within the sandbox
   */
  public async execute(
    manifest: PluginManifest,
    entry: PluginEntry,
    input?: unknown
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.auditEvents = [];

    try {
      // Phase 5 feature gate check
      if (!isPhase5Enabled(this.env || {})) {
        return this.createResult(false, 'Phase 5 advanced agents are not enabled', startTime);
      }

      // Pre-execution validation
      const validationResult = await this.validateExecution(manifest);
      if (!validationResult.allowed) {
        return this.createResult(false, validationResult.error, startTime);
      }

      // Create runtime API with policy enforcement
      const runtimeApi = this.createRuntimeApi(manifest);

      // Execute with timeout and resource limits
      const result = await this.executeWithLimits(manifest, entry, runtimeApi, input, startTime);

      return this.createResult(result.success, result.error, startTime, result.output);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordAuditEvent('execute.failed', errorMessage, { error: errorMessage });
      return this.createResult(false, errorMessage, startTime);
    }
  }

  /**
   * Validate execution is allowed based on manifest and sandbox options
   */
  private async validateExecution(manifest: PluginManifest): Promise<{ allowed: boolean; error?: string }> {
    // Check network capability
    if (this.options.denyNetwork && manifest.capabilities.includes(PluginCapability.NETWORK_ACCESS)) {
      const error = 'Network access denied by sandbox policy';
      await this.recordAuditEvent('execute.rejected', error, { capability: 'network_access' });
      return { allowed: false, error };
    }

    // Check secret access capability
    if (this.options.denySecrets && manifest.capabilities.includes(PluginCapability.SECRET_ACCESS)) {
      const error = 'Secret access denied by sandbox policy';
      await this.recordAuditEvent('execute.rejected', error, { capability: 'secret_access' });
      return { allowed: false, error };
    }

    // Validate resource limits
    if (this.options.memoryLimitMb && manifest.resourceLimits.maxMemoryMb > this.options.memoryLimitMb) {
      const error = `Plugin requires ${manifest.resourceLimits.maxMemoryMb}MB, but sandbox limit is ${this.options.memoryLimitMb}MB`;
      await this.recordAuditEvent('execute.rejected', error, { required: manifest.resourceLimits.maxMemoryMb, limit: this.options.memoryLimitMb });
      return { allowed: false, error };
    }

    return { allowed: true };
  }

  /**
   * Create runtime API with policy enforcement
   */
  private createRuntimeApi(manifest: PluginManifest): RuntimeApi {
    const config = this.options.config || {};

    return {
      log: (level, message, meta) => {
        const redactedMessage = this.redactString(`[${manifest.name}] ${message}`);
        this.logger?.(level, redactedMessage, meta);
      },

      getConfig: (key) => {
        // Only allow access to non-sensitive config keys
        if (this.isSensitiveKey(key)) {
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
   * Execute plugin with timeout and resource limits
   */
  private async executeWithLimits(
    manifest: PluginManifest,
    entry: PluginEntry,
    runtimeApi: RuntimeApi,
    input: unknown,
    _startTime: number
  ): Promise<{ success: boolean; output?: unknown; error?: string }> {
    const timeoutMs = this.options.timeoutMs || manifest.resourceLimits.maxExecutionTimeMs;

    await this.recordAuditEvent('execute.started', 'Plugin execution started', {
      timeoutMs,
      memoryLimitMb: this.options.memoryLimitMb,
      capabilities: manifest.capabilities
    });

    const executionPromise = (async () => {
      try {
        const result = await entry(runtimeApi, input);
        await this.recordAuditEvent('execute.succeeded', 'Plugin execution completed successfully');
        return { success: true, output: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.recordAuditEvent('execute.failed', errorMessage, { error: errorMessage });
        return { success: false, error: errorMessage };
      }
    })();

    const timeoutPromise = new Promise<{ success: boolean; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Execution timed out' });
      }, timeoutMs);
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);

    if (!result.success && result.error === 'Execution timed out') {
      await this.recordAuditEvent('execute.timeout', 'Plugin execution timed out', { timeoutMs });
    }

    return result;
  }

  /**
   * Create execution result
   */
  private createResult(
    success: boolean,
    error?: string,
    startTime: number = Date.now(),
    output?: unknown
  ): ExecutionResult {
    const durationMs = Date.now() - startTime;

    return {
      success,
      output,
      error,
      durationMs,
      auditEvents: [...this.auditEvents]
    };
  }

  /**
   * Record audit event
   */
  private async recordAuditEvent(action: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const event = {
      timestamp: new Date().toISOString(),
      action,
      message,
      metadata
    };

    this.auditEvents.push(event);

    if (this.auditService) {
      await this.auditService.record({
        timestamp: new Date().toISOString(),
        eventType: 'plugin_execution',
        action,
        message,
        metadata: {
          ...metadata,
          component: 'sandbox_runtime'
        }
      });
    }
  }

  /**
   * Redact sensitive information from strings
   */
  private redactString(s: string): string {
    return s
      .replace(/\b(sk-[a-zA-Z0-9]{10,})\b/g, '[REDACTED_TOKEN]')
      .replace(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, '[REDACTED_EMAIL]');
  }

  /**
   * Check if a configuration key is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'token', 'secret', 'password', 'key', 'api_key', 'auth',
      'credential', 'private', 'access_token', 'refresh_token'
    ];

    return sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive));
  }
}
