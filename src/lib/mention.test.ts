import { describe, it, expect } from 'vitest';
import {
  fullNameOf, isAddressed, applyMention, stripLeadingMention,
  extractAddressPartial, mentionCandidates, resolveMention,
} from './mention';
import type { UserRecord } from '../types/admin';

const users: UserRecord[] = [
  { id: 'u1', firstName: 'Marcus', lastName: 'Lee', email: 'marcus@4core.com', role: 'Agent', bu: 'POS' },
  { id: 'u2', firstName: 'Sarah', lastName: 'Okafor', email: 'sarah@4core.com', role: 'Agent', bu: 'POS' },
  { id: 'u3', firstName: 'Priya', lastName: 'Nair', email: 'priya@4core.com', role: 'Executive', bu: 'B2B' },
];

describe('fullNameOf', () => {
  it('joins first and last name', () => {
    expect(fullNameOf(users[0])).toBe('Marcus Lee');
  });
});

describe('mentionCandidates', () => {
  it('excludes the current user by email, case-insensitively', () => {
    const candidates = mentionCandidates(users, 'MARCUS@4core.com');
    expect(candidates.map(u => u.id)).toEqual(['u2', 'u3']);
  });

  it('returns everyone when the email matches no one', () => {
    const candidates = mentionCandidates(users, 'nobody@4core.com');
    expect(candidates.map(u => u.id)).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('isAddressed', () => {
  it('returns true for a leading mention with a space', () => {
    expect(isAddressed('@Marcus Lee please review')).toBe(true);
  });

  it('returns true for a bare leading mention plus message', () => {
    expect(isAddressed('@Marcus please review')).toBe(true);
  });

  it('returns false for text without a mention', () => {
    expect(isAddressed('please review')).toBe(false);
  });

  it('returns false for a lone incomplete @', () => {
    expect(isAddressed('@')).toBe(false);
  });

  it('returns false for a trailing mention', () => {
    expect(isAddressed('please review @Marcus')).toBe(false);
  });
});

describe('applyMention', () => {
  it('prepends the full name and preserves the rest of the draft', () => {
    expect(applyMention('please review', 'Marcus Lee')).toBe('@Marcus Lee please review');
  });

  it('prepends with trailing space when the draft is empty', () => {
    expect(applyMention('', 'Marcus Lee')).toBe('@Marcus Lee ');
  });

  it('replaces a leading partial mention', () => {
    expect(applyMention('@Mar please review', 'Marcus Lee')).toBe('@Marcus Lee please review');
  });

  it('replaces an existing one-word leading mention', () => {
    expect(applyMention('@Priya hi', 'Marcus Lee')).toBe('@Marcus Lee hi');
  });

  it('replaces an existing full-name mention when combined with stripLeadingMention (reply flow)', () => {
    expect(applyMention(stripLeadingMention('@Priya Nair hi'), 'Marcus Lee')).toBe('@Marcus Lee hi');
  });
});

describe('stripLeadingMention', () => {
  it('removes a full-name leading mention and its trailing space', () => {
    expect(stripLeadingMention('@Marcus Lee hello')).toBe('hello');
  });

  it('removes a bare one-word mention', () => {
    expect(stripLeadingMention('@Marcus')).toBe('');
  });

  it('handles a draft that is only the mention', () => {
    expect(stripLeadingMention('@Marcus')).toBe('');
  });

  it('leaves text without a leading mention untouched', () => {
    expect(stripLeadingMention('hello team')).toBe('hello team');
  });
});

describe('extractAddressPartial', () => {
  it('returns the partial word after a leading @', () => {
    expect(extractAddressPartial('@Mar hello')).toBe('mar');
  });

  it('returns empty when there is no leading @', () => {
    expect(extractAddressPartial('hello @Mar')).toBe('');
  });

  it('returns empty for a resolved address with a space', () => {
    expect(extractAddressPartial('@Marcus Lee hello')).toBe('marcus');
  });

  it('returns empty for a lone @', () => {
    expect(extractAddressPartial('@')).toBe('');
  });
});

describe('resolveMention', () => {
  it('matches by full name', () => {
    expect(resolveMention('@Marcus Lee hello', users)?.id).toBe('u1');
  });

  it('matches by first name', () => {
    expect(resolveMention('@Sarah how are you', users)?.id).toBe('u2');
  });

  it('returns null for an unresolvable name', () => {
    expect(resolveMention('@Unknown Person hi', users)).toBeNull();
  });

  it('returns null when there is no mention', () => {
    expect(resolveMention('hi team', users)).toBeNull();
  });
});
