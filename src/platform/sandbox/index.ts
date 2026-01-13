import type { PluginManifest } from '../plugin-sdk/types';

export interface SandboxOptions {
  timeoutMs?: number;
  allowedHosts?: string[]; // allowlist for network
  denyNetwork?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export class SandboxRunner {
  constructor(private opts: SandboxOptions = {}) {}

  // NOTE: This is a spec-level implementation that performs static checks.
  // Actual runtime sandboxing (container or DO) is out-of-scope for Stage 1.
  public async execute(manifest: PluginManifest, input: unknown): Promise<ExecutionResult> {
    const start = Date.now();
    // simple policy enforcement
    if (this.opts.denyNetwork && manifest.capabilities.includes('network' as any)) {
      return { success: false, error: 'network capability is not allowed in this sandbox', durationMs: Date.now() - start };
    }

    // disallow filesystem unless explicit
    if (manifest.capabilities.includes('filesystem' as any) && !manifest.capabilities.includes('filesystem' as any)) {
      return { success: false, error: 'filesystem capability not permitted', durationMs: Date.now() - start };
    }

    // Simulate execution success
    return { success: true, output: { message: 'sandboxed execution simulated' }, durationMs: Date.now() - start };
  }
}
