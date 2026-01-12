/**
 * Code Analysis Service for PR Review
 * Phase 3.5: PR review analysis engine
 */

import type { AIClient } from '../../../platform/ai/client';
import type { AgentLogger } from '../../../types/agents';
import type { GitHubPullRequestFile } from '../../../types/github';
import { PR_REVIEW_SYSTEM_PROMPT, buildPRReviewPrompt } from '../prompts/review-prompt';
import type { ReviewSeverity, ReviewFocusArea } from '../config';
import { MAX_FILES_PER_REVIEW, MAX_LINES_PER_FILE } from '../config';

export interface ReviewComment {
  path: string;
  line: number;
  severity: ReviewSeverity;
  category: ReviewFocusArea;
  message: string;
  suggestion?: string;
}

export interface CodeAnalysisResult {
  comments: ReviewComment[];
  summary: {
    totalFiles: number;
    analyzedFiles: number;
    issuesFound: number;
    bySeverity: Record<ReviewSeverity, number>;
    byCategory: Partial<Record<ReviewFocusArea, number>>;
  };
}

export class CodeAnalysisService {
  private ai: AIClient;
  private logger: AgentLogger;

  constructor(ai: AIClient, logger: AgentLogger) {
    this.ai = ai;
    this.logger = logger;
  }

  /**
   * Analyze PR files and generate review comments
   */
  async analyzePR(
    files: GitHubPullRequestFile[],
    options?: {
      focusAreas?: ReviewFocusArea[];
      minSeverity?: ReviewSeverity;
      ignorePatterns?: string[];
    }
  ): Promise<CodeAnalysisResult> {
    this.logger.info('Starting code analysis', {
      totalFiles: files.length,
    });

    const compiledIgnorePatterns = this.compileIgnorePatterns(options?.ignorePatterns);

    // Filter and limit files
    const analyzableFiles = files
      .filter(file => file.patch && file.status !== 'removed')
      .filter(file => this.isAnalyzableFile(file.filename, compiledIgnorePatterns))
      .slice(0, MAX_FILES_PER_REVIEW);

    if (analyzableFiles.length === 0) {
      this.logger.info('No files to analyze');
      return this.emptyResult(files.length);
    }

    // Prepare files for analysis
    const filesForAnalysis = analyzableFiles.map(file => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: this.truncatePatch(file.patch || '', MAX_LINES_PER_FILE),
    }));

    try {
      // Get AI analysis
      const prompt = buildPRReviewPrompt(filesForAnalysis);
      const response = await this.ai.generateCompletion({
        messages: [
          { role: 'system', content: PR_REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2, // Low temperature for consistent analysis
      });

      const comments = this.parseReviewComments(response.content);
      const filteredComments = this.filterComments(comments, options);

      return this.buildAnalysisResult(files.length, analyzableFiles.length, filteredComments);
    } catch (error) {
      this.logger.error('Code analysis failed', error as Error);
      return this.emptyResult(files.length);
    }
  }

  private compileIgnorePatterns(patterns?: string[]): RegExp[] {
    if (!patterns || patterns.length === 0) {
      return [];
    }

    const compiled: RegExp[] = [];

    for (const pattern of patterns) {
      try {
        compiled.push(new RegExp(pattern));
      } catch (error) {
        this.logger.warn('Ignoring invalid review ignore pattern', { pattern, error });
      }
    }

    return compiled;
  }

  /**
   * Check if a file should be analyzed
   */
  private isAnalyzableFile(filename: string, additionalIgnore?: RegExp[]): boolean {
    const ignoredExtensions = [
      '.json', '.lock', '.md', '.txt', '.yml', '.yaml',
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
      '.woff', '.woff2', '.ttf', '.eot',
    ];

    const ignoredPatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.min\./,
      /dist\//,
      /build\//,
      /node_modules\//,
      ...(additionalIgnore || []),
    ];

    // Check extension
    const ext = filename.substring(filename.lastIndexOf('.'));
    if (ignoredExtensions.includes(ext.toLowerCase())) {
      return false;
    }

    // Check patterns
    return !ignoredPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Truncate patch to maximum lines
   */
  private truncatePatch(patch: string, maxLines: number): string {
    const lines = patch.split('\n');
    if (lines.length <= maxLines) {
      return patch;
    }
    return lines.slice(0, maxLines).join('\n') + '\n... (truncated)';
  }

  private filterComments(
    comments: ReviewComment[],
    options?: { focusAreas?: ReviewFocusArea[]; minSeverity?: ReviewSeverity }
  ): ReviewComment[] {
    const severityOrder: Record<ReviewSeverity, number> = {
      info: 0,
      warning: 1,
      error: 2,
    };

    const minSeverity = options?.minSeverity;
    const focusAreas = options?.focusAreas;
    const severityThreshold = minSeverity ? severityOrder[minSeverity] : null;

    return comments.filter(comment => {
      const severityValue = severityOrder[comment.severity];
      const passesSeverity = severityThreshold === null || severityValue >= severityThreshold;
      const passesFocus = focusAreas && focusAreas.length > 0
        ? focusAreas.includes(comment.category)
        : true;
      return passesSeverity && passesFocus;
    });
  }

  /**
   * Parse AI response into review comments
   */
  private parseReviewComments(content: string): ReviewComment[] {
    try {
      // Try to extract JSON from response
      let jsonContent = content.trim();
      
      // Remove markdown code blocks if present
      const codeBlockMatch = jsonContent.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1];
      }

      const comments = JSON.parse(jsonContent) as ReviewComment[];

      // Validate structure
      if (!Array.isArray(comments)) {
        throw new Error('Expected array of comments');
      }

      return comments.filter(comment => {
        return (
          comment.path &&
          typeof comment.line === 'number' &&
          comment.severity &&
          comment.category &&
          comment.message
        );
      });
    } catch (error) {
      this.logger.error('Failed to parse review comments', error as Error, { content });
      return [];
    }
  }

  /**
   * Build analysis result summary
   */
  private buildAnalysisResult(
    totalFiles: number,
    analyzedFiles: number,
    comments: ReviewComment[]
  ): CodeAnalysisResult {
    const bySeverity: Record<ReviewSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    };

    const byCategory: Partial<Record<ReviewFocusArea, number>> = {};

    for (const comment of comments) {
      bySeverity[comment.severity]++;
      byCategory[comment.category] = (byCategory[comment.category] || 0) + 1;
    }

    return {
      comments,
      summary: {
        totalFiles,
        analyzedFiles,
        issuesFound: comments.length,
        bySeverity,
        byCategory,
      },
    };
  }

  /**
   * Create empty result
   */
  private emptyResult(totalFiles: number): CodeAnalysisResult {
    return {
      comments: [],
      summary: {
        totalFiles,
        analyzedFiles: 0,
        issuesFound: 0,
        bySeverity: { error: 0, warning: 0, info: 0 },
        byCategory: {},
      },
    };
  }
}
