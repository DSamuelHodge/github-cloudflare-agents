/**
 * Issue validation service
 */

import type { GitHubIssueWebhookPayload } from '../../../types/github';
import type { IssueResponderConfig } from '../config';

export interface ValidationResult {
  shouldProcess: boolean;
  reason?: string;
}

export class IssueValidationService {
  constructor(private config: IssueResponderConfig) {}
  
  /**
   * Validate if issue should be processed
   */
  validate(payload: GitHubIssueWebhookPayload): ValidationResult {
    const { action, issue, repository } = payload;
    
    // Check action type
    const allowedActions = ['opened', 'labeled'];
    if (!allowedActions.includes(action)) {
      return {
        shouldProcess: false,
        reason: `Action '${action}' not in allowed list: ${allowedActions.join(', ')}`,
      };
    }
    
    // Check for target labels (if configured)
    if (this.config.targetLabels.length > 0) {
      const hasTargetLabel = issue.labels.some(label =>
        this.config.targetLabels.includes(label.name)
      );
      
      if (!hasTargetLabel) {
        return {
          shouldProcess: false,
          reason: `Issue #${issue.number} missing required labels: ${this.config.targetLabels.join(', ')}`,
        };
      }
    }
    
    // Check target repository if configured
    if (this.config.targetRepo && repository.full_name !== this.config.targetRepo) {
      return {
        shouldProcess: false,
        reason: `Repository ${repository.full_name} doesn't match target: ${this.config.targetRepo}`,
      };
    }
    
    return { shouldProcess: true };
  }
}
