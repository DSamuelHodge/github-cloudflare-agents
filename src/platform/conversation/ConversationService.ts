/**
 * Conversation storage service for threaded discussions
 */

import type { Conversation, ConversationMessage } from '../../types/conversation';
import { getConversationKey } from '../../types/conversation';
import { Logger } from '../../utils/logger';

export class ConversationService {
  private logger: Logger;
  private readonly MAX_MESSAGES = 10;
  private readonly TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
  
  constructor(
    private kvNamespace: KVNamespace,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.logger = new Logger(logLevel, { component: 'ConversationService' });
  }
  
  /**
   * Get conversation history for an issue
   */
  async getConversation(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<Conversation | null> {
    const key = getConversationKey(owner, repo, issueNumber);
    
    try {
      const value = await this.kvNamespace.get(key, 'json');
      return value as Conversation | null;
    } catch (error) {
      this.logger.error('Failed to get conversation', error as Error, {
        owner,
        repo,
        issueNumber,
      });
      return null;
    }
  }
  
  /**
   * Add a message to the conversation
   */
  async addMessage(
    owner: string,
    repo: string,
    issueNumber: number,
    issueTitle: string,
    message: Omit<ConversationMessage, 'id'> & { id?: string }
  ): Promise<void> {
    const key = getConversationKey(owner, repo, issueNumber);
    
    try {
      // Get existing conversation or create new
      let conversation = await this.getConversation(owner, repo, issueNumber);
      
      if (!conversation) {
        conversation = {
          owner,
          repo,
          issueNumber,
          issueTitle,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      
      // Add message with ID
      const fullMessage: ConversationMessage = {
        id: message.id || `msg-${Date.now()}`,
        timestamp: message.timestamp,
        author: message.author,
        role: message.role,
        content: message.content,
      };
      
      conversation.messages.push(fullMessage);
      conversation.updatedAt = new Date().toISOString();
      
      // Trim to max messages (keep newest)
      if (conversation.messages.length > this.MAX_MESSAGES) {
        conversation.messages = conversation.messages.slice(-this.MAX_MESSAGES);
      }
      
      // Store in KV with TTL
      await this.kvNamespace.put(key, JSON.stringify(conversation), {
        expirationTtl: this.TTL_SECONDS,
        metadata: {
          owner,
          repo,
          issueNumber: issueNumber.toString(),
          messageCount: conversation.messages.length.toString(),
        },
      });
      
      this.logger.debug('Message added to conversation', {
        owner,
        repo,
        issueNumber,
        messageCount: conversation.messages.length,
      });
    } catch (error) {
      this.logger.error('Failed to add message', error as Error, {
        owner,
        repo,
        issueNumber,
      });
      throw error;
    }
  }
  
  /**
   * Get recent messages for context (for AI prompt)
   */
  async getRecentMessages(
    owner: string,
    repo: string,
    issueNumber: number,
    limit: number = 5
  ): Promise<ConversationMessage[]> {
    const conversation = await this.getConversation(owner, repo, issueNumber);
    
    if (!conversation || conversation.messages.length === 0) {
      return [];
    }
    
    // Return last N messages (most recent)
    return conversation.messages.slice(-limit);
  }
  
  /**
   * Clear conversation history
   */
  async clearConversation(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<void> {
    const key = getConversationKey(owner, repo, issueNumber);
    
    try {
      await this.kvNamespace.delete(key);
      this.logger.info('Conversation cleared', { owner, repo, issueNumber });
    } catch (error) {
      this.logger.error('Failed to clear conversation', error as Error, {
        owner,
        repo,
        issueNumber,
      });
    }
  }
}
