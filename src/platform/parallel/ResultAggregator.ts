/**
 * ResultAggregator - Compares and aggregates parallel test results
 * Phase 2.5: Generate comparative analysis and recommend optimal solution
 */

import type {
  ParallelTestResult,
  SolutionTestResult,
  ScoringWeights,
} from '../../types/parallel';

/**
 * Comparison report between solutions
 */
export interface ComparisonReport {
  /** Job ID */
  jobId: string;
  
  /** Summary text */
  summary: string;
  
  /** Detailed comparison table */
  comparisonTable: ComparisonRow[];
  
  /** Winner recommendation */
  recommendation: {
    solutionId: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  } | null;
  
  /** Warnings or concerns */
  warnings: string[];
  
  /** Generated timestamp */
  generatedAt: Date;
}

/**
 * Row in comparison table
 */
export interface ComparisonRow {
  solutionId: string;
  name: string;
  testsPassed: number;
  testsFailed: number;
  passRate: number;
  duration: string;
  coverage?: string;
  score: number;
  rank: number;
  status: 'passed' | 'failed' | 'error';
}

/**
 * ResultAggregator class
 */
export class ResultAggregator {
  private weights: ScoringWeights;

  constructor(weights?: Partial<ScoringWeights>) {
    this.weights = {
      passRate: weights?.passRate ?? 0.5,
      coverage: weights?.coverage ?? 0.2,
      speed: weights?.speed ?? 0.1,
      confidence: weights?.confidence ?? 0.2,
    };
  }

  /**
   * Generate comprehensive comparison report
   */
  generateReport(result: ParallelTestResult): ComparisonReport {
    const comparisonTable = this.buildComparisonTable(result);
    const recommendation = this.determineRecommendation(result);
    const warnings = this.detectWarnings(result);
    const summary = this.generateSummary(result, recommendation);

    return {
      jobId: result.jobId,
      summary,
      comparisonTable,
      recommendation,
      warnings,
      generatedAt: new Date(),
    };
  }

  /**
   * Build comparison table from results
   */
  private buildComparisonTable(result: ParallelTestResult): ComparisonRow[] {
    return result.results.map(solutionResult => {
      const ranking = result.ranking.find(r => r.solutionId === solutionResult.solutionId);
      
      return {
        solutionId: solutionResult.solutionId,
        name: this.getSolutionName(solutionResult.solutionId),
        testsPassed: solutionResult.metrics.testsPassed,
        testsFailed: solutionResult.metrics.testsFailed,
        passRate: solutionResult.metrics.passRate,
        duration: this.formatDuration(solutionResult.durationMs),
        coverage: solutionResult.coverage
          ? `${Math.round((solutionResult.coverage.lines + solutionResult.coverage.functions) / 2)}%`
          : undefined,
        score: ranking?.score ?? 0,
        rank: ranking?.rank ?? result.results.length,
        status: this.getStatus(solutionResult),
      };
    }).sort((a, b) => a.rank - b.rank);
  }

  /**
   * Determine recommendation based on results
   */
  private determineRecommendation(result: ParallelTestResult): ComparisonReport['recommendation'] {
    if (!result.winner) {
      return null;
    }

    const winnerResult = result.results.find(r => r.solutionId === result.winner!.solutionId);
    if (!winnerResult) {
      return null;
    }

    // Determine confidence level
    const passedCount = result.summary.solutionsPassed;
    const isOnlyPassed = passedCount === 1;
    const isPerfect = winnerResult.metrics.passRate === 100;

    let confidence: 'high' | 'medium' | 'low';
    if (isPerfect && isOnlyPassed) {
      confidence = 'high';
    } else if (isPerfect) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Generate reason
    let reason = `${result.winner.solutionId} achieved `;
    if (isPerfect) {
      reason += '100% test pass rate';
    } else {
      reason += `${winnerResult.metrics.passRate.toFixed(1)}% test pass rate`;
    }
    
    if (passedCount > 1) {
      reason += ` and had the highest overall score among ${passedCount} passing solutions`;
    } else if (passedCount === 1) {
      reason += ` and was the only solution to pass tests`;
    }

    return {
      solutionId: result.winner.solutionId,
      confidence,
      reason,
    };
  }

  /**
   * Detect warnings and concerns
   */
  private detectWarnings(result: ParallelTestResult): string[] {
    const warnings: string[] = [];

    // All solutions failed
    if (result.summary.solutionsPassed === 0) {
      warnings.push('⚠️ All solutions failed to pass tests. Manual review required.');
    }

    // Low pass rates
    const lowPassResults = result.results.filter(
      r => r.metrics.passRate > 0 && r.metrics.passRate < 50
    );
    if (lowPassResults.length > 0) {
      warnings.push(`⚠️ ${lowPassResults.length} solution(s) had low pass rates (<50%).`);
    }

    // Long execution times
    const slowResults = result.results.filter(r => r.durationMs > 120000); // 2 minutes
    if (slowResults.length > 0) {
      warnings.push(`⚠️ ${slowResults.length} solution(s) took >2 minutes to execute.`);
    }

    // No tests found
    const noTestResults = result.results.filter(r => r.metrics.totalTests === 0);
    if (noTestResults.length > 0) {
      warnings.push(`⚠️ ${noTestResults.length} solution(s) reported no tests. Check test configuration.`);
    }

    // Multiple winners with same score
    if (result.ranking.length >= 2) {
      const topScore = result.ranking[0].score;
      const tiedWinners = result.ranking.filter(r => r.score === topScore);
      if (tiedWinners.length > 1) {
        warnings.push(`ℹ️ ${tiedWinners.length} solutions tied for top score.`);
      }
    }

    return warnings;
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    result: ParallelTestResult,
    recommendation: ComparisonReport['recommendation']
  ): string {
    const { summary } = result;
    
    let text = `## Parallel Test Results\n\n`;
    text += `Tested **${summary.solutionsTested}** solution variants in **${this.formatDuration(summary.totalDurationMs)}**.\n\n`;
    
    if (summary.solutionsPassed > 0) {
      text += `✅ **${summary.solutionsPassed}** solution(s) passed all tests.\n`;
    }
    if (summary.solutionsFailed > 0) {
      text += `❌ **${summary.solutionsFailed}** solution(s) failed.\n`;
    }

    if (recommendation) {
      text += `\n### Recommendation\n`;
      text += `**${recommendation.solutionId}** is recommended with **${recommendation.confidence}** confidence.\n`;
      text += `> ${recommendation.reason}\n`;
    } else {
      text += `\n### No Recommendation\n`;
      text += `Unable to recommend a solution. All solutions failed or produced errors.\n`;
    }

    return text;
  }

  /**
   * Generate markdown report for GitHub comment
   */
  generateMarkdownReport(result: ParallelTestResult): string {
    const report = this.generateReport(result);
    
    let markdown = report.summary;
    markdown += '\n### Comparison\n\n';
    
    // Build table header
    markdown += '| Rank | Solution | Tests Passed | Pass Rate | Duration | Score | Status |\n';
    markdown += '|:----:|----------|-------------:|----------:|---------:|------:|:------:|\n';
    
    // Build table rows
    for (const row of report.comparisonTable) {
      const statusEmoji = row.status === 'passed' ? '✅' : row.status === 'failed' ? '❌' : '⚠️';
      markdown += `| ${row.rank} | ${row.name} | ${row.testsPassed}/${row.testsPassed + row.testsFailed} `;
      markdown += `| ${row.passRate.toFixed(1)}% | ${row.duration} | ${row.score.toFixed(1)} | ${statusEmoji} |\n`;
    }

    // Add warnings
    if (report.warnings.length > 0) {
      markdown += '\n### Warnings\n\n';
      for (const warning of report.warnings) {
        markdown += `- ${warning}\n`;
      }
    }

    return markdown;
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Get human-readable solution name
   */
  private getSolutionName(solutionId: string): string {
    const letter = solutionId.replace('solution-', '').toUpperCase();
    return `Solution ${letter}`;
  }

  /**
   * Get status from result
   */
  private getStatus(result: SolutionTestResult): 'passed' | 'failed' | 'error' {
    if (result.status === 'error') return 'error';
    if (result.status === 'success' && result.metrics.passRate === 100) return 'passed';
    return 'failed';
  }
}
