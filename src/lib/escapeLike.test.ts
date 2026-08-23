import { describe, it, expect } from 'vitest';
import { escapeLike } from '../../server/lib/escapeLike';

describe('escapeLike', () => {
  it('escapes the percent wildcard', () => {
    expect(escapeLike('a%b')).toBe('a\\%b');
  });

  it('escapes the underscore wildcard', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes the backslash escape character', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('handles a payload of pure wildcards', () => {
    expect(escapeLike('%_%_')).toBe('\\%\\_\\%\\_');
  });

  it('leaves ordinary email addresses untouched', () => {
    const email = 'user.name+tag@example.com';
    // dot and plus are not LIKE metacharacters
    expect(escapeLike(email)).toBe(email);
  });

  it('leaves strings without metacharacters unchanged', () => {
    expect(escapeLike('Business Unit A')).toBe('Business Unit A');
    expect(escapeLike('')).toBe('');
  });

  it('neutralises lockout-bypass patterns (BUG-02 regression)', () => {
    // 'a%' previously matched multiple accounts under ILIKE, making
    // isAccountLocked's .single() error out and default to "not locked".
    const escaped = escapeLike('a%');
    expect(escaped).toBe('a\\%');
    // Every wildcard is backslash-escaped — none remain bare.
    expect(escaped.replace(/\\[%_\\]/g, '')).not.toMatch(/[%_]/);
  });
});
