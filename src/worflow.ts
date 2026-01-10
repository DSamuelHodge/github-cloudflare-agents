export interface GitHubIssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string;
    labels: Array<{ name: string }>;
    html_url: string;
    user: {
      login: string;
    };
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_BOT_USERNAME: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  TARGET_REPO?: string;
  GITHUB_WEBHOOK_SECRET: string;
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export class GitHubIssueWorkflow {
  async run(payload: { payload: GitHubIssuePayload }, _step: unknown, env: Env) {
    const { issue, repository, action } = payload.payload;

    // Step 1: Validate the issue event
    const shouldProcess = (() => {
      // Allow newly opened issues or issues that were labeled after creation
      const allowedActions = ['opened', 'labeled'];
      if (!allowedActions.includes(action)) {
        console.log(`Skipping issue #${issue.number}: action is '${action}', not one of ${allowedActions.join(', ')}`);
        return false;
      }

      // Check if the issue has 'help' or 'bug' label
      const hasTargetLabel = issue.labels.some(
        (label) => label.name === 'help' || label.name === 'bug'
      );

      if (!hasTargetLabel) {
        console.log(`Skipping issue #${issue.number}: no 'help' or 'bug' label`);
        return false;
      }

      // Optionally filter by target repository
      if (env.TARGET_REPO && repository.full_name !== env.TARGET_REPO) {
        console.log(`Skipping issue #${issue.number}: repository ${repository.full_name} doesn't match target`);
        return false;
      }

      console.log(`Processing issue #${issue.number} from ${repository.full_name}`);
      return true;
    })();

    if (!shouldProcess) {
      return { success: false, reason: 'Issue does not meet processing criteria' };
    }

    console.log('[WORKFLOW] Calling Gemini API');
    // Step 2: Call Gemini (OpenAI-compatible) API
    let aiResponse: { content: string; tokensUsed: number };
    try {
      const prompt = this.buildPrompt(issue);

      const response = await fetch(GEMINI_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GEMINI_API_KEY || ''}`,
        },
        body: JSON.stringify({
          model: env.GEMINI_MODEL || 'gemini-3.0-flash',
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { total_tokens: number };
      };

      aiResponse = {
        content: data.choices[0].message.content,
        tokensUsed: data.usage.total_tokens,
      };
    } catch (error) {
      console.error('[WORKFLOW] Gemini API error:', error);
      throw error;
    }

    // Step 3: Format the response as a GitHub comment
    const formattedComment = this.formatGitHubComment(aiResponse.content, issue.user.login);

    // Step 4: Post the comment to the GitHub issue
    try {
      const commentUrl = `https://api.github.com/repos/${repository.full_name}/issues/${issue.number}/comments`;

      const response = await fetch(commentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GITHUB_TOKEN || ''}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': env.GITHUB_BOT_USERNAME || 'cloudflare-ai-bot',
        },
        body: JSON.stringify({
          body: formattedComment,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as { html_url: string; id: number };
      const commentResult = {
        commentUrl: data.html_url,
        commentId: data.id,
      };

      // Step 5: Return success result
      return {
        success: true,
        issue: {
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
        },
        ai: {
          tokensUsed: aiResponse.tokensUsed,
        },
        comment: {
          url: commentResult.commentUrl,
          id: commentResult.commentId,
        },
      };
    } catch (error) {
      console.error('[WORKFLOW] GitHub API error:', error);
      throw error;
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert technical support assistant helping developers troubleshoot issues in their GitHub repositories.

Your role is to:
1. Analyze the issue title and description carefully
2. Identify the root cause or most likely causes
3. Provide 1-3 concrete, actionable solutions
4. Format code snippets in Markdown code blocks with appropriate language syntax
5. Reference relevant documentation and sources at the bottom of your response

Guidelines:
- Be concise and actionable
- Prioritize the most likely solutions first
- Include code examples when helpful
- Link to official documentation when possible
- Be encouraging and professional in tone
- If the issue is unclear, ask clarifying questions`;
  }

  private buildPrompt(issue: { title: string; body: string }): string {
    return `A user has opened a GitHub issue that needs troubleshooting assistance.

**Issue Title:** ${issue.title}

**Issue Description:**
${issue.body || 'No description provided.'}

Please analyze this issue and provide 1-3 possible solutions. Format your response with:
1. A brief analysis of the problem
2. Numbered solutions (1-3) with clear steps
3. Code snippets in Markdown code blocks where applicable
4. References to documentation at the bottom

Keep your response helpful, actionable, and well-formatted for GitHub.`;
  }

  private formatGitHubComment(aiContent: string, username: string): string {
    return `Hi @${username}! 

I'm an AI assistant here to help troubleshoot your issue. Here's my analysis:

${aiContent}

---

*This response was generated by an AI assistant. While I strive to provide helpful suggestions, please verify solutions in your specific context. If you need further assistance, feel free to ask follow-up questions or tag a human maintainer.*`;
  }
}