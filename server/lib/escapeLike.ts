/**
 * Escape PostgreSQL LIKE/ILIKE wildcards in user-supplied values.
 *
 * Without escaping, `%` (any sequence) and `_` (any single char) in user
 * input broaden the pattern beyond intent. In auth paths this can defeat
 * exact-match lookups (e.g. `.single()` erroring on multi-row matches makes
 * account-lockout checks default to "not locked"). Apply before every
 * `.ilike()` / `.like()` call whose argument is not a trusted constant.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => '\\' + c);
}
