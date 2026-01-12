/**
 * Conversation types for threaded discussions
 */

/**
 * A single message in a conversation
 */
export interface ConversationMessage {
  id: string; // Unique message ID (GitHub comment ID or issue ID)
  timestamp: string;
  author: string; // GitHub username
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Conversation history for an issue
 */
export interface Conversation {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Conversation storage key
 */
export function getConversationKey(owner: string, repo: string, issueNumber: number): string {
  return `conversation:${owner}/${repo}/${issueNumber}`;
}
