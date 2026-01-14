/**
 * Role Assignment Service - assigns roles to agents based on policies
 */

import type { AgentRole } from '../../agents/roles/roles.schema';
import { Roles } from '../../agents/roles/roles.schema';
import type { RepositoryContext } from '../../types/repository';

export interface RoleAssignmentPolicy {
  /** Agent name pattern (supports wildcards) */
  agentPattern: string;
  /** Role to assign */
  role: AgentRole;
  /** Repository conditions (optional) */
  repositoryConditions?: {
    owner?: string;
    repo?: string;
  };
}

/**
 * Default role assignment policies
 * Maps agent names to roles based on their capabilities
 */
const DEFAULT_POLICIES: RoleAssignmentPolicy[] = [
  // Read-only agents get readonly role
  {
    agentPattern: 'issue-responder',
    role: Roles.readonlyService,
  },
  {
    agentPattern: 'triaging',
    role: Roles.readonlyService,
  },
  // Write-capable agents get maintainer role
  {
    agentPattern: 'pr-agent',
    role: Roles.maintainer,
  },
  {
    agentPattern: 'pr-review',
    role: Roles.maintainer,
  },
  {
    agentPattern: 'security-scan',
    role: Roles.readonlyService, // Security scans are read-only
  },
  {
    agentPattern: 'code-generation',
    role: Roles.maintainer, // Code generation requires write access
  },
];

export class RoleAssignmentService {
  private policies: RoleAssignmentPolicy[] = [...DEFAULT_POLICIES];

  /**
   * Add a custom role assignment policy
   */
  addPolicy(policy: RoleAssignmentPolicy): void {
    this.policies.push(policy);
  }

  /**
   * Assign role to an agent based on policies
   */
  assignRole(agentName: string, repository?: RepositoryContext): AgentRole {
    // Find matching policies (first match wins)
    for (const policy of this.policies) {
      if (this.matchesPattern(agentName, policy.agentPattern)) {
        // Check repository conditions if specified
        if (policy.repositoryConditions && repository) {
          if (!this.matchesRepositoryConditions(repository, policy.repositoryConditions)) {
            continue;
          }
        }
        return policy.role;
      }
    }

    // Default to readonly role if no policy matches
    console.warn(`[RoleAssignment] No policy found for agent '${agentName}', defaulting to readonly role`);
    return Roles.readonlyService;
  }

  /**
   * Check if agent name matches pattern (supports wildcards)
   */
  private matchesPattern(agentName: string, pattern: string): boolean {
    // Simple wildcard support: * matches any characters
    const regexPattern = pattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(agentName);
  }

  /**
   * Check if repository matches conditions
   */
  private matchesRepositoryConditions(
    repository: RepositoryContext,
    conditions: NonNullable<RoleAssignmentPolicy['repositoryConditions']>
  ): boolean {
    if (conditions.owner && repository.owner !== conditions.owner) {
      return false;
    }
    if (conditions.repo && repository.repo !== conditions.repo) {
      return false;
    }
    return true;
  }

  /**
   * Get all policies (for debugging/testing)
   */
  getPolicies(): readonly RoleAssignmentPolicy[] {
    return [...this.policies];
  }

  /**
   * Clear all policies (for testing)
   */
  clearPolicies(): void {
    this.policies = [];
  }
}

// Global instance
export const globalRoleAssignmentService = new RoleAssignmentService();