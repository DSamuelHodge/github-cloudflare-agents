/**
 * Phase 3.10: Analytics and Observability
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { Phase3Analytics } from '../src/platform/analytics/phase3';
import type { AgentLogger } from '../src/types/agents';
import type { RepositoryContext } from '../src/types/repository';

const noopLogger: AgentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const mockRepositoryContext: RepositoryContext = {
  owner: 'test-owner',
  repo: 'test-repo',
  fullName: 'test-owner/test-repo',
  config: {
    id: 'test-owner/test-repo',
    owner: 'test-owner',
    repo: 'test-repo',
    enabledAgents: ['TriagingAgent', 'PRReviewAgent'],
    storagePrefix: 'test-owner/test-repo/',
  },
  storagePrefix: 'test-owner/test-repo/',
};

describe('Phase 3.10: Analytics and Observability', () => {
  let analytics: Phase3Analytics;

  beforeEach(() => {
    analytics = new Phase3Analytics(noopLogger);
  });

  describe('Triaging metrics', () => {
    it('records triaging events with confidence', () => {
      analytics.recordTriagingEvent(0.85, 2, 1, true, mockRepositoryContext);
      analytics.recordTriagingEvent(0.92, 3, 2, true, mockRepositoryContext);

      const report = analytics.generateReport(
        new Map([['test-owner/test-repo', mockRepositoryContext]])
      );

      expect(report.triaging.totalIssuesTriaged).toBe(2);
      expect(report.triaging.successRate).toBe(100);
      expect(report.triaging.averageConfidence).toBeCloseTo(0.885, 2);
    });

    it('tracks triaging failures', () => {
      analytics.recordTriagingEvent(0.4, 0, 0, false, mockRepositoryContext);
      analytics.recordTriagingEvent(0.85, 2, 1, true, mockRepositoryContext);

      const report = analytics.generateReport(
        new Map([['test-owner/test-repo', mockRepositoryContext]])
      );

      expect(report.triaging.totalIssuesTriaged).toBe(2);
      expect(report.triaging.successRate).toBe(50);
      expect(report.triaging.errorRate).toBe(50);
    });
  });

  describe('PR review metrics', () => {
    it('records PR review events with issues found', () => {
      analytics.recordPRReviewEvent(3, true, true, mockRepositoryContext);
      analytics.recordPRReviewEvent(5, true, true, mockRepositoryContext);

      const report = analytics.generateReport(
        new Map([['test-owner/test-repo', mockRepositoryContext]])
      );

      expect(report.prReview.totalPRsReviewed).toBe(2);
      expect(report.prReview.averageIssuesPerPR).toBe(4);
      expect(report.prReview.successRate).toBe(100);
    });

    it('tracks review posting success', () => {
      analytics.recordPRReviewEvent(2, true, true, mockRepositoryContext);
      analytics.recordPRReviewEvent(0, false, true, mockRepositoryContext);

      const report = analytics.generateReport(
        new Map([['test-owner/test-repo', mockRepositoryContext]])
      );

      expect(report.prReview.reviewsPosted).toBe(1);
    });
  });

  describe('Repository metrics', () => {
    it('aggregates metrics per repository', () => {
      const repo1: RepositoryContext = {
        owner: 'org1',
        repo: 'repo1',
        fullName: 'org1/repo1',
        config: { id: 'org1/repo1', owner: 'org1', repo: 'repo1', enabledAgents: ['TriagingAgent'], storagePrefix: '' },
        storagePrefix: 'org1/repo1/',
      };

      const repo2: RepositoryContext = {
        owner: 'org2',
        repo: 'repo2',
        fullName: 'org2/repo2',
        config: null,
        storagePrefix: 'org2/repo2/',
      };

      analytics.recordTriagingEvent(0.9, 1, 0, true, repo1);
      analytics.recordPRReviewEvent(2, true, true, repo1);
      analytics.recordTriagingEvent(0.5, 0, 0, false, repo2);

      const report = analytics.generateReport(
        new Map([
          ['org1/repo1', repo1],
          ['org2/repo2', repo2],
        ])
      );

      expect(report.repositories).toHaveLength(2);
      const org1Repo1 = report.repositories.find(r => r.repository === 'org1/repo1');
      const org2Repo2 = report.repositories.find(r => r.repository === 'org2/repo2');

      expect(org1Repo1).toBeDefined();
      expect(org1Repo1?.eventCount).toBe(2);
      expect(org1Repo1?.successCount).toBe(2);
      expect(org1Repo1?.enabled).toBe(true);

      expect(org2Repo2).toBeDefined();
      expect(org2Repo2?.eventCount).toBe(1);
      expect(org2Repo2?.failureCount).toBe(1);
      expect(org2Repo2?.enabled).toBe(false);
    });
  });

  describe('Error tracking', () => {
    it('tracks top failures', () => {
      analytics.recordTriagingEvent(0.3, 0, 0, false, mockRepositoryContext);
      analytics.recordTriagingEvent(0.2, 0, 0, false, mockRepositoryContext);
      analytics.recordPRReviewEvent(0, false, false, mockRepositoryContext);

      const report = analytics.generateReport(
        new Map([['test-owner/test-repo', mockRepositoryContext]])
      );

      expect(report.topFailures.length).toBeGreaterThan(0);
      const triagingFailures = report.topFailures.find(f => f.metric === 'triaging.failure');
      expect(triagingFailures?.count).toBe(2);
    });
  });

  describe('Report generation', () => {
    it('includes proper timestamps', () => {
      analytics.recordTriagingEvent(0.8, 1, 0, true, mockRepositoryContext);

      const beforeReport = new Date();
      const report = analytics.generateReport(
        new Map([['test-owner/test-repo', mockRepositoryContext]])
      );
      const afterReport = new Date();

      expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(beforeReport.getTime());
      expect(report.timestamp.getTime()).toBeLessThanOrEqual(afterReport.getTime());
      expect(report.period.startTime.getTime()).toBeLessThanOrEqual(report.period.endTime.getTime());
    });
  });
});
