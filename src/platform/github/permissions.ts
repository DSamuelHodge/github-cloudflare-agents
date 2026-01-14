/**
 * GitHub Permissions Service
 * Phase 3.2: Pre-flight permission checking
 */

import type { GitHubClient } from './client';
import type { AgentLogger } from '../../types/agents';

export type GitHubPermissionLevel = 'admin' | 'write' | 'read' | 'none';

export interface PermissionRequirement {
  operation: 'issue:write' | 'issue:label' | 'issue:assign' | 'pr:write' | 'pr:review' | 'repo:read';
  minimumLevel: GitHubPermissionLevel;
}

const PERMISSION_REQUIREMENTS: Record<string, PermissionRequirement> = {
  'issue:write': { operation: 'issue:write', minimumLevel: 'write' },
  'issue:label': { operation: 'issue:label', minimumLevel: 'triage' as GitHubPermissionLevel },
  'issue:assign': { operation: 'issue:assign', minimumLevel: 'triage' as GitHubPermissionLevel },
  'pr:write': { operation: 'pr:write', minimumLevel: 'write' },
  'pr:review': { operation: 'pr:review', minimumLevel: 'read' },
  'repo:read': { operation: 'repo:read', minimumLevel: 'read' },
};

export class PermissionService {
  private github: GitHubClient;
    private logger: AgentLogger;
  private username: string;
  private cache: Map<string, GitHubPermissionLevel>;

    constructor(github: GitHubClient, username: string, logger: AgentLogger) {
    this.github = github;
    this.username = username;
    this.logger = logger;
    this.cache = new Map();
  }

  /**
   * Check if the authenticated user has permission for an operation
   * @param operation - The operation to check (e.g., 'issue:write', 'pr:review')
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Promise<boolean> - true if permission granted, false otherwise
   */
  async checkPermission(
    operation: keyof typeof PERMISSION_REQUIREMENTS,
    owner: string,
    repo: string
  ): Promise<boolean> {
    const requirement = PERMISSION_REQUIREMENTS[operation];
    if (!requirement) {
      this.logger.warn('Unknown operation type', { operation });
      return false;
    }

    try {
      const level = await this.getPermissionLevel(owner, repo);
      const hasPermission = this.meetsRequirement(level, requirement.minimumLevel);

      if (!hasPermission) {
        this.logger.warn('Insufficient permissions', {
          operation,
          required: requirement.minimumLevel,
          actual: level,
          owner,
          repo,
        });
      }

      return hasPermission;
    } catch (error) {
      this.logger.error('Permission check failed', error as Error, { operation, owner, repo });
      // Fail open: allow operation to proceed if permission check fails
      return true;
    }
  }

  /**
   * Get the permission level for the authenticated user
   * Caches the result for the lifetime of this service instance (single request)
   */
  private async getPermissionLevel(owner: string, repo: string): Promise<GitHubPermissionLevel> {
    const cacheKey = `${owner}/${repo}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return cached;
      // fallthrough to fetch if unexpected cache miss
    }

    try {
      const result = await this.github.getRepositoryPermissions(owner, repo, this.username);
      this.cache.set(cacheKey, result.permission);
      return result.permission;
    } catch (error) {
      this.logger.warn('Failed to fetch repository permissions', { owner, repo, error });
      // Default to 'read' on error
      return 'read';
    }
  }

  /**
   * Check if the actual permission level meets the requirement
   */
  private meetsRequirement(
    actual: GitHubPermissionLevel | 'triage' | 'maintain',
    required: GitHubPermissionLevel
  ): boolean {
    const levels: Array<GitHubPermissionLevel | 'triage' | 'maintain'> = [
      'none',
      'read',
      'triage',
      'write',
      'maintain',
      'admin',
    ];

    const actualIndex = levels.indexOf(actual);
    const requiredIndex = levels.indexOf(required);

    return actualIndex >= requiredIndex;
  }

  /**
   * Create a permission service from environment
   */
  static create(github: GitHubClient, username: string, logger: AgentLogger): PermissionService {
    return new PermissionService(github, username, logger);
  }
}
