/**
 * Repository Configuration Service
 * Phase 3.3: Multi-repository configuration management
 */

import type {
  RepositoryConfig,
  RepositoryRegistry,
} from '../types/repository';
import { DEFAULT_REPOSITORY_CONFIG } from '../types/repository';
import type { AgentLogger } from '../types/agents';

export class RepositoryConfigService {
  private registry: RepositoryRegistry;
  private logger: AgentLogger;

  constructor(registry: RepositoryRegistry, logger: AgentLogger) {
    this.registry = registry;
    this.logger = logger;
    this.validateRegistry();
  }

  /**
   * Get configuration for a repository
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Repository configuration or null if not found
   */
  getConfig(owner: string, repo: string): RepositoryConfig | null {
    const repoId = `${owner}/${repo}`;
    
    // Try exact match first
    if (this.registry.repositories[repoId]) {
      return this.registry.repositories[repoId];
    }
    
    // Try default repository
    if (this.registry.defaultRepo && this.registry.repositories[this.registry.defaultRepo]) {
      this.logger.info('Using default repository config', { repoId, default: this.registry.defaultRepo });
      return this.registry.repositories[this.registry.defaultRepo];
    }
    
    this.logger.warn('No configuration found for repository', { repoId });
    return null;
  }

  /**
   * Check if a repository is configured
   */
  hasConfig(owner: string, repo: string): boolean {
    return this.getConfig(owner, repo) !== null;
  }

  /**
   * Get all configured repositories
   */
  getAllConfigs(): RepositoryConfig[] {
    return Object.values(this.registry.repositories);
  }

  /**
   * Check if an agent is enabled for a repository
   */
  isAgentEnabled(owner: string, repo: string, agentName: string): boolean {
    const config = this.getConfig(owner, repo);
    if (!config) {
      return false;
    }
    
    return config.enabledAgents.includes(agentName);
  }

  /**
   * Get storage prefix for a repository (for R2/KV isolation)
   */
  getStoragePrefix(owner: string, repo: string): string {
    const config = this.getConfig(owner, repo);
    return config?.storagePrefix || `${owner}/${repo}/`;
  }

  /**
   * Validate the repository registry
   */
  private validateRegistry(): void {
    const repoCount = Object.keys(this.registry.repositories).length;
    
    if (repoCount === 0) {
      this.logger.warn('No repositories configured in registry');
    }

    for (const [repoId, config] of Object.entries(this.registry.repositories)) {
      if (!config.owner || !config.repo) {
        throw new Error(`Invalid repository config for ${repoId}: missing owner or repo`);
      }

      if (config.enabledAgents.length === 0) {
        this.logger.warn('Repository has no enabled agents', { repoId });
      }
    }

    this.logger.info('Repository registry validated', {
      repoCount,
      defaultRepo: this.registry.defaultRepo,
    });
  }

  /**
   * Create repository config service from environment
   */
  static fromEnvironment(env: { TARGET_REPO?: string; REPO_CONFIG?: string }, logger: AgentLogger): RepositoryConfigService {
    let registry: RepositoryRegistry;

    // Check for multi-repo JSON config
    if (env.REPO_CONFIG) {
      try {
        registry = JSON.parse(env.REPO_CONFIG) as RepositoryRegistry;
      } catch (error) {
        logger.error('Failed to parse REPO_CONFIG', error as Error);
        throw new Error('Invalid REPO_CONFIG JSON');
      }
    }
    // Backward compatibility: single repo via TARGET_REPO
    else if (env.TARGET_REPO) {
      const [owner, repo] = env.TARGET_REPO.split('/');
      const repoId = env.TARGET_REPO;
      
      registry = {
        defaultRepo: repoId,
        repositories: {
          [repoId]: {
            id: repoId,
            owner,
            repo,
            ...DEFAULT_REPOSITORY_CONFIG,
            storagePrefix: '',
          } as RepositoryConfig,
        },
      };
    }
    // Default: empty registry (allow all repos)
    else {
      logger.warn('No repository configuration found. Using permissive mode.');
      registry = {
        repositories: {},
      };
    }

    return new RepositoryConfigService(registry, logger);
  }
}
