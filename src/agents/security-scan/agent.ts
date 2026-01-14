import { BaseAgent, AgentConfig, AgentContext } from '../../types/agents';
import { logger } from '../../utils/logger';

export interface SnykVulnerability {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  package: string;
  version: string;
  url?: string;
}

export interface CodeRabbitFinding {
  file: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ruleId?: string;
}

export interface SecurityScanResult {
  snykVulnerabilities: SnykVulnerability[];
  codeRabbitFindings: CodeRabbitFinding[];
}

export class SecurityScanAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  async run(context: AgentContext): Promise<SecurityScanResult> {
    // Aggregate results from Snyk and CodeRabbit
    const snykVulnerabilities = await this.scanWithSnyk(context);
    const codeRabbitFindings = await this.scanWithCodeRabbit(context);
    return {
      snykVulnerabilities,
      codeRabbitFindings,
    };
  }

  // Placeholder for Snyk integration
  async scanWithSnyk(context: AgentContext): Promise<SnykVulnerability[]> {
    // In production, invoke Snyk API or CLI and parse results
    // Example stub: return a known vulnerability if lodash is present
    const deps = (context.payload && typeof context.payload === 'object' && 'dependencies' in context.payload)
      ? (context.payload as { dependencies: Array<{ name: string; version: string }> }).dependencies
      : [];
    return deps.filter(dep => dep.name === 'lodash').map(dep => ({
      id: 'CVE-2020-8203',
      title: 'Prototype Pollution',
      severity: 'high',
      package: dep.name,
      version: dep.version,
      url: 'https://snyk.io/vuln/SNYK-JS-LODASH-590103',
    }));
  }

  // Placeholder for CodeRabbit integration
  async scanWithCodeRabbit(context: AgentContext): Promise<CodeRabbitFinding[]> {
    // In production, invoke CodeRabbit API or CLI and parse results
    // Example stub: return a finding if file matches pattern
    const files = (context.payload && typeof context.payload === 'object' && 'files' in context.payload)
      ? (context.payload as { files: Array<{ file: string; content: string }> }).files
      : [];
    return files.filter(f => f.file.endsWith('server.js')).map(f => ({
      file: f.file,
      issue: 'Potential unsafe eval usage',
      severity: 'critical',
      ruleId: 'CR-EVAL-001',
    }));
  }
}
