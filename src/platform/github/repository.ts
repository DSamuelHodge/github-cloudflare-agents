/**
 * GitHub Repository Service
 * Provides file fetching and repository content access
 */

import type { GitHubFileContent, GitHubContent } from '../../types/github';

export interface RepositoryFileOptions {
  owner: string;
  repo: string;
  path: string;
  ref?: string; // branch, tag, or commit SHA
}

export interface RepositoryFileResult {
  content: string;
  path: string;
  size: number;
  sha: string;
  encoding: string;
}

export class GitHubRepositoryService {
  private baseUrl: string;
  private token: string;
  private userAgent: string;
  
  // Configuration
  private readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB
  
  constructor(config: { token: string; userAgent: string; baseUrl?: string }) {
    this.token = config.token;
    this.userAgent = config.userAgent;
    this.baseUrl = config.baseUrl || 'https://api.github.com';
  }
  
  /**
   * Fetch a single file from the repository
   */
  async getFile(options: RepositoryFileOptions): Promise<RepositoryFileResult> {
    const { owner, repo, path, ref } = options;
    
    // Build API path
    let apiPath = `/repos/${owner}/${repo}/contents/${path}`;
    if (ref) {
      apiPath += `?ref=${encodeURIComponent(ref)}`;
    }
    
    // Fetch from GitHub API
    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': this.userAgent,
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      const errorText = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json() as GitHubContent;
    
    // Handle directory vs file
    if (Array.isArray(data)) {
      throw new Error(`Path is a directory, not a file: ${path}`);
    }
    
    const fileData = data as GitHubFileContent;
    
    if (fileData.type !== 'file') {
      throw new Error(`Path is not a file (type: ${fileData.type}): ${path}`);
    }
    
    // Check file size
    if (fileData.size > this.MAX_FILE_SIZE) {
      throw new Error(
        `File exceeds maximum size of ${this.MAX_FILE_SIZE} bytes: ${path} (${fileData.size} bytes)`
      );
    }
    
    // Check if content is available
    if (!fileData.content) {
      throw new Error(`File content not available: ${path}`);
    }
    
    // Decode base64 content
    let decodedContent: string;
    try {
      if (fileData.encoding === 'base64') {
        // Decode base64 to UTF-8
        const binaryString = atob(fileData.content.replace(/\n/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        decodedContent = new TextDecoder('utf-8').decode(bytes);
      } else {
        // Content is already decoded
        decodedContent = fileData.content;
      }
    } catch (error) {
      throw new Error(`Failed to decode file content: ${path} - ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return {
      content: decodedContent,
      path: fileData.path,
      size: fileData.size,
      sha: fileData.sha,
      encoding: fileData.encoding || 'utf-8',
    };
  }
  
  /**
   * Fetch multiple files in parallel
   */
  async getFiles(files: RepositoryFileOptions[]): Promise<RepositoryFileResult[]> {
    const promises = files.map(fileOptions => this.getFile(fileOptions));
    return Promise.all(promises);
  }
  
  /**
   * Check if a file exists
   */
  async fileExists(options: RepositoryFileOptions): Promise<boolean> {
    try {
      await this.getFile(options);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * Create a GitHub repository service from environment
 */
export function createGitHubRepositoryService(env: {
  GITHUB_TOKEN: string;
  GITHUB_BOT_USERNAME: string;
}): GitHubRepositoryService {
  return new GitHubRepositoryService({
    token: env.GITHUB_TOKEN,
    userAgent: env.GITHUB_BOT_USERNAME || 'cloudflare-ai-agent',
  });
}
