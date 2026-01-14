/**
 * ToolRegistry - central registry for platform tools and capability metadata
 */

export interface ToolMetadata {
  id: string;
  description: string;
  requiredSecrets?: string[];
  capabilityTags?: string[];
}

export class ToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();

  register(tool: ToolMetadata): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  get(toolId: string): ToolMetadata | undefined {
    return this.tools.get(toolId);
  }

  list(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  isRegistered(toolId: string): boolean {
    return this.tools.has(toolId);
  }
}
