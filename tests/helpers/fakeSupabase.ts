/**
 * In-memory stand-in for the Supabase client used by server/repository.ts.
 * Supports the query surface the repository actually uses (eq/ilike/in/not/
 * order/limit/single/maybeSingle plus insert/upsert/update/delete).
 */

import bcrypt from 'bcryptjs';

export type TableStore = Record<string, any[]>;

function matchesLike(value: any, pattern: string): boolean {
  if (value == null) return false;
  const s = String(value).toLowerCase();
  const p = String(pattern).toLowerCase();
  if (p.includes('%')) {
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    return new RegExp(`^${escaped}$`).test(s);
  }
  return s === p;
}

function parseInSet(val: string): any[] {
  if (val.startsWith('(') && val.endsWith(')')) {
    return val.slice(1, -1).split(',').map((v) => v.trim());
  }
  return val.split(',').map((v) => v.trim());
}

class QueryBuilder {
  private filters: Array<(row: any) => boolean> = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private mutation: { type: 'update' | 'delete'; row?: any } | null = null;
  private headMode: boolean = false;
  private rangeSlice: { from: number; to: number } | null = null;
  private countMode: string | null = null;
  private pendingInsert: any[] | null = null;

  constructor(
    private table: string,
    private store: TableStore
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.headMode = true;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? null) === (val ?? null));
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? null) !== (val ?? null));
    return this;
  }

  ilike(col: string, pattern: string) {
    this.filters.push((r) => matchesLike(r[col], pattern));
    return this;
  }

  /** PostgREST-style OR: "col.op.value,col.op.value" — rows matching ANY predicate. */
  or(clause: string) {
    const predicates = clause.split(',').map((p) => p.trim()).filter(Boolean);
    const compiled = predicates.map((p) => {
      const m = /^([^.\s]+)\.([^.\s]+)\.(.*)$/.exec(p);
      if (!m) return () => false;
      const [, col, op, rawVal] = m;
      const val = rawVal.replace(/^"|"$/g, '');
      return (row: any) => {
        if (op === 'eq') return (row[col] ?? null) === val;
        if (op === 'neq') return (row[col] ?? null) !== val;
        if (op === 'ilike') return matchesLike(row[col], val);
        return false;
      };
    });
    this.filters.push((r) => compiled.some((fn) => fn(r)));
    return this;
  }

  in(col: string, arr: any[]) {
    this.filters.push((r) => arr.includes(r[col]));
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? '') >= val);
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? '') > val);
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? '') <= val);
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? '') < val);
    return this;
  }

  not(col: string, _op: string, val: string) {
    const set = parseInSet(val);
    this.filters.push((r) => !set.includes(r[col]));
    return this;
  }

  contains(col: string, val: string) {
    let target: any[];
    try { target = JSON.parse(val); } catch { target = [val]; }
    this.filters.push((r) => {
      const arr = Array.isArray(r[col]) ? r[col] : [];
      return target.some((v: any) => arr.includes(v));
    });
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number) {
    const rows = this.computeRows();
    this.rangeSlice = { from, to };
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  insert(rows: any) {
    this.pendingInsert = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [{ ...rows }];
    return this;
  }

  upsert(rows: any, opts?: { onConflict?: string }) {
    const list = Array.isArray(rows) ? rows : [rows];
    const key = opts?.onConflict || 'id';
    const tableRows = this.store[this.table] || (this.store[this.table] = []);
    for (const row of list) {
      const idx = tableRows.findIndex((r) => r[key] === row[key]);
      if (idx >= 0) tableRows[idx] = { ...tableRows[idx], ...row };
      else tableRows.push({ ...row });
    }
    return Promise.resolve({ data: list, error: null });
  }

  update(row: any) {
    this.mutation = { type: 'update', row };
    return this;
  }

  delete() {
    this.mutation = { type: 'delete' };
    return this;
  }

  private computeRows() {
    let rows = [...(this.store[this.table] || [])];
    for (const f of this.filters) rows = rows.filter(f);
    if (this.orderBy) {
      rows.sort((a, b) => {
        const va = a[this.orderBy!.col];
        const vb = b[this.orderBy!.col];
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return this.orderBy!.ascending ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    if (this.rangeSlice) rows = rows.slice(this.rangeSlice.from, this.rangeSlice.to + 1);
    return rows;
  }

  private applyInsert(rows: any[]): Promise<{ data: any; error: null }> {
    const tableRows = this.store[this.table] || (this.store[this.table] = []);
    tableRows.push(...rows.map((r) => ({ ...r })));
    return Promise.resolve({ data: rows, error: null });
  }

  private execute(): Promise<{ data: any; error: any }> {
    if (this.pendingInsert) {
      const tableRows = this.store[this.table] || (this.store[this.table] = []);
      tableRows.push(...this.pendingInsert);
      const inserted = [...this.pendingInsert];
      this.pendingInsert = null;
      if (this.singleMode) {
        return Promise.resolve({ data: inserted[0], error: null });
      }
      return Promise.resolve({ data: inserted, error: null });
    }

    if (this.mutation?.type === 'delete') {
      const tableRows = this.store[this.table] || [];
      const remove = new Set(this.computeRows().map((r) => tableRows.indexOf(r)));
      this.store[this.table] = tableRows.filter((_, i) => !remove.has(i));
      return Promise.resolve({ data: null, error: null });
    }
    if (this.mutation?.type === 'update') {
      const tableRows = this.store[this.table] || [];
      const updated: any[] = [];
      for (const row of this.computeRows()) {
        const idx = tableRows.indexOf(row);
        if (idx >= 0) {
          tableRows[idx] = { ...row, ...this.mutation!.row };
          updated.push(tableRows[idx]);
        }
      }
      if (this.singleMode) {
        return Promise.resolve(updated.length > 0 ? { data: updated[0], error: null } : { data: null, error: { message: 'No rows returned', code: 'PGRST116' } });
      }
      return Promise.resolve({ data: updated, error: null });
    }

    const rows = this.computeRows();
    const totalCount = this.countMode ? (this.store[this.table] || []).filter((r) => this.filters.every((f) => f(r))).length : undefined;
    if (this.headMode) {
      return Promise.resolve({ data: null, count: rows.length, error: null });
    }
    if (this.singleMode) {
      if (rows.length === 0) {
        return Promise.resolve(
          this.singleMode === 'maybeSingle'
            ? { data: null, error: null }
            : { data: null, error: { message: 'No rows returned', code: 'PGRST116' } }
        );
      }
      return Promise.resolve({ data: rows[0], error: null });
    }
    return Promise.resolve({ data: rows, count: totalCount, error: null });
  }

  then(onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any) {
    return this.execute().then(onFulfilled, onRejected);
  }
}

export function createFakeSupabase(seed: TableStore) {
  const store: TableStore = {};
  for (const [table, rows] of Object.entries(seed)) {
    store[table] = rows.map((r) => ({ ...r }));
  }
  return {
    from: (table: string) => new QueryBuilder(table, store),
    // Minimal auth stub so auth-provider code paths are type-safe in tests.
    // Tests operate in "local" provider mode by default, so these are not
    // exercised unless a test explicitly enables Supabase auth.
    auth: {
      // Mimics Supabase Auth: an identity is provisioned for any email already
      // present in the users store, and the password must match the seeded
      // password_hash (bcrypt) or the plaintext `password_plaintext` column.
      signInWithPassword: async ({ email, password }: any) => {
        const row = (store.users || []).find(
          (u: any) => String(u.email).toLowerCase() === String(email).toLowerCase()
        );
        if (!row) {
          return { data: null, error: { message: 'Invalid login credentials' } };
        }
        let ok = false;
        if (row.password_hash && row.password_hash.startsWith('$2')) {
          ok = bcrypt.compareSync(password, row.password_hash);
        } else if (row.password_plaintext) {
          ok = row.password_plaintext === password;
        }
        if (!ok) {
          return { data: null, error: { message: 'Invalid login credentials' } };
        }
        return { data: { user: { id: 'auth-' + email, email, password_plaintext: password } }, error: null };
      },
      resetPasswordForEmail: async (_email: string, _opts: any) => ({ data: {}, error: null }),
      getUser: async (token: string) => {
        if (!token.startsWith('token-')) {
          return { data: null, error: new Error('No session') };
        }
        const email = token.slice('token-'.length);
        return {
          data: email ? { user: { id: 'auth-' + email, email } } : null,
          error: email ? null : new Error('No session'),
        };
      },
      admin: {
        createUser: async ({ email, password, email_confirm, user_metadata }: any) => ({
          data: { user: { id: 'auth-' + email, email, user_metadata } },
          error: null,
        }),
        updateUserById: async (id: string, attrs: any) => {
          const row = (store.users || []).find((u: any) => u.id === id || u.auth_user_id === id);
          if (row) {
            if (attrs.email) row.email = attrs.email;
            if (attrs.password) row.password_plaintext = attrs.password;
            if (attrs.user_metadata?.full_name) row.name = attrs.user_metadata.full_name;
            if (attrs.ban_duration !== undefined) row.ban_duration = attrs.ban_duration;
          }
          return { data: { user: { id, ...attrs } }, error: null };
        },
        deleteUser: async (_id: string) => ({ error: null }),
      },
    },
    // Minimal storage stub so evidence/avatar upload flows complete in tests.
    storage: {
      listBuckets: async () => ({ data: [{ name: 'branding-assets' }], error: null }),
      createBucket: async () => ({ error: null }),
      from: (_bucket: string) => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake.supabase.co/storage/${path}` } }),
        createSignedUrl: (_path: string, _expiresIn: number) => ({ data: { signedUrl: `https://fake.supabase.co/storage/${_path}?signed` }, error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  };
}
