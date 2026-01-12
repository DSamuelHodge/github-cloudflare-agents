/**
 * Repository utilities for webhook routing
 */

import { RepositoryConfigService } from '../platform/repository-config';
import type { RepositoryContext, RepositoryTarget } from '../types/repository';

/**
 * Extract repository identity from a GitHub webhook payload
 */
export function extractRepositoryTarget(payload: unknown): RepositoryTarget | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { repository?: unknown };
  const repository = candidate.repository;

  if (!repository || typeof repository !== 'object') {
    return null;
  }

  const name = (repository as { name?: unknown }).name;
  const ownerObject = (repository as { owner?: unknown }).owner;
  const fullName = (repository as { full_name?: unknown }).full_name;

  if (!ownerObject || typeof ownerObject !== 'object') {
    return null;
  }

  const ownerLogin = (ownerObject as { login?: unknown }).login;

  if (typeof name !== 'string' || typeof ownerLogin !== 'string') {
    return null;
  }

  return {
    owner: ownerLogin,
    repo: name,
    fullName: typeof fullName === 'string' ? fullName : `${ownerLogin}/${name}`,
  };
}

/**
 * Resolve repository context with configuration and storage prefix
 */
export function resolveRepositoryContext(
  target: RepositoryTarget,
  configService: RepositoryConfigService
): RepositoryContext {
  const config = configService.getConfig(target.owner, target.repo);
  const storagePrefix = config?.storagePrefix && config.storagePrefix.length > 0
    ? config.storagePrefix
    : `${target.owner}/${target.repo}/`;

  return {
    ...target,
    config,
    storagePrefix,
  };
}

/**
 * Check if the registry has any configured repositories
 */
export function hasRepositoryConfigs(configService: RepositoryConfigService): boolean {
  return configService.getAllConfigs().length > 0;
}
