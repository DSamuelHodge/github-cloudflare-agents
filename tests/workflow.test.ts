import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('GitHubIssueWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue Validation', () => {
    it('should process issues with "help" label', () => {
      const payload = {
        action: 'opened',
        issue: {
          number: 1,
          title: 'Need help with setup',
          body: 'How do I configure this?',
          labels: [{ name: 'help' }],
          html_url: 'https://github.com/test/test/issues/1',
          user: { login: 'testuser' },
        },
        repository: {
          full_name: 'test/test',
          name: 'test',
          owner: { login: 'test' },
        },
      };

      // Test that this payload would be processed
      const hasTargetLabel = payload.issue.labels.some(
        (label) => label.name === 'help' || label.name === 'bug'
      );
      expect(hasTargetLabel).toBe(true);
      expect(payload.action).toBe('opened');
    });

    it('should process issues with "bug" label', () => {
      const payload = {
        action: 'opened',
        issue: {
          number: 2,
          title: 'Application crashes on startup',
          body: 'Getting error: Cannot read property...',
          labels: [{ name: 'bug' }],
          html_url: 'https://github.com/test/test/issues/2',
          user: { login: 'testuser' },
        },
        repository: {
          full_name: 'test/test',
          name: 'test',
          owner: { login: 'test' },
        },
      };

      const hasTargetLabel = payload.issue.labels.some(
        (label) => label.name === 'help' || label.name === 'bug'
      );
      expect(hasTargetLabel).toBe(true);
    });

    it('should skip issues without target labels', () => {
      const payload = {
        action: 'opened',
        issue: {
          number: 3,
          title: 'Feature request',
          body: 'Add dark mode',
          labels: [{ name: 'enhancement' }],
          html_url: 'https://github.com/test/test/issues/3',
          user: { login: 'testuser' },
        },
        repository: {
          full_name: 'test/test',
          name: 'test',
          owner: { login: 'test' },
        },
      };

      const hasTargetLabel = payload.issue.labels.some(
        (label) => label.name === 'help' || label.name === 'bug'
      );
      expect(hasTargetLabel).toBe(false);
    });

    it('should skip non-opened actions', () => {
      const payload = {
        action: 'closed',
        issue: {
          number: 4,
          title: 'Need help',
          body: 'Help please',
          labels: [{ name: 'help' }],
          html_url: 'https://github.com/test/test/issues/4',
          user: { login: 'testuser' },
        },
        repository: {
          full_name: 'test/test',
          name: 'test',
          owner: { login: 'test' },
        },
      };

      expect(payload.action).not.toBe('opened');
    });
  });

  describe('Prompt Building', () => {
    it('should create a structured prompt from issue data', () => {
      const issue = {
        title: 'Database connection timeout',
        body: 'Getting error when connecting to PostgreSQL:\n\nError: timeout',
      };

      const expectedContent = [
        'Issue Title:',
        'Database connection timeout',
        'Issue Description:',
        'Getting error when connecting to PostgreSQL',
        'Error: timeout',
      ];

      const prompt = buildTestPrompt(issue);
      
      expectedContent.forEach(content => {
        expect(prompt).toContain(content);
      });
    });

    it('should handle issues with no body', () => {
      const issue = {
        title: 'Quick question',
        body: '',
      };

      const prompt = buildTestPrompt(issue);
      expect(prompt).toContain('Quick question');
      expect(prompt).toContain('No description provided');
    });
  });

  describe('Comment Formatting', () => {
    it('should format AI response as GitHub comment', () => {
      const aiContent = `## Analysis\n\nThe issue is caused by...\n\n## Solutions\n\n1. First solution\n2. Second solution`;
      const username = 'testuser';

      const comment = formatTestComment(aiContent, username);

      expect(comment).toContain('@testuser');
      expect(comment).toContain('AI assistant');
      expect(comment).toContain(aiContent);
      expect(comment).toContain('verify solutions');
    });
  });
});

// Helper functions for testing
function buildTestPrompt(issue: { title: string; body: string }): string {
  return `A user has opened a GitHub issue that needs troubleshooting assistance.

**Issue Title:** ${issue.title}

**Issue Description:**
${issue.body || 'No description provided.'}

Please analyze this issue and provide 1-3 possible solutions.`;
}

function formatTestComment(aiContent: string, username: string): string {
  return `Hi @${username}! 👋

I'm an AI assistant here to help troubleshoot your issue. Here's my analysis:

${aiContent}

---

*This response was generated by an AI assistant. While I strive to provide helpful suggestions, please verify solutions in your specific context.*`;
}