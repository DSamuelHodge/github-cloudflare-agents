import type { AgentRole } from '../agents/roles/roles.schema';

export class PrivilegeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivilegeError';
  }
}

/**
 * Enforce that the provided role allows the provided toolId
 * Throws PrivilegeError when not allowed
 */
export function enforceToolPrivilege(role: AgentRole, toolId: string): void {
  if (!role.allowedTools.includes(toolId)) {
    throw new PrivilegeError(`Role '${role.name}' is not permitted to use tool '${toolId}'`);
  }
}
