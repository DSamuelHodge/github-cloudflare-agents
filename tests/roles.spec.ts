import { describe, it, expect } from 'vitest';
import { enforceToolPrivilege, PrivilegeError } from '../middleware/privilege-check';
import { Roles } from '../src/agents/roles/roles.schema';

describe('Privilege enforcement', () => {
  it('allows permitted tool', () => {
    expect(() => enforceToolPrivilege(Roles.readonlyService, 'snyk-scan')).not.toThrow();
  });

  it('blocks disallowed tool', () => {
    expect(() => enforceToolPrivilege(Roles.readonlyService, 'git-write')).toThrow(PrivilegeError);
  });
});
