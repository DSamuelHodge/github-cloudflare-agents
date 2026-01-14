export { ToolRegistry, type ToolMetadata } from './ToolRegistry';

// Global tool registry instance (runtime singleton)
import { ToolRegistry as _ToolRegistry } from './ToolRegistry';
export const globalToolRegistry = new _ToolRegistry();
