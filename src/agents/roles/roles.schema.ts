export interface AgentRole {
  name: string;
  description?: string;
  allowedTools: string[];
  allowedScopes?: string[]; // e.g., repo, org
  escalationPolicy?: string;
}

// Example roles
export const Roles = {
  readonlyService: {
    name: 'readonly',
    description: 'Read-only access to repository metadata and analytics',
    allowedTools: ['snyk-scan', 'code-read'],
    allowedScopes: ['repo'],
  } as AgentRole,

  maintainer: {
    name: 'maintainer',
    description: 'Can create PRs and annotate issues',
    allowedTools: ['git-write', 'pr-create', 'code-format'],
    allowedScopes: ['repo'],
  } as AgentRole,
};
