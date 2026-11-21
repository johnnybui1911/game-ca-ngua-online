/**
 * A minimal in-memory D1 stand-in over Node's built-in SQLite, for tests that need the real SQL
 * to run. It covers only what the auth code uses: prepare/bind, run/first/all and batch.
 * `node:sqlite` is loaded at run time because the worker type environment has no Node typings.
 */
import type { Env } from '../env';

interface RunInfo {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}
interface NativeStatement {
  run(...params: unknown[]): RunInfo;
  all(...params: unknown[]): unknown[];
}
interface NativeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NativeStatement;
}

interface Result {
  results: unknown[];
  meta: { changes: number; last_row_id: number };
}

class Statement {
  constructor(
    private readonly db: NativeDatabase,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }

  exec(): Result {
    // D1 numbers parameters (`?1`, reused freely); node:sqlite binds anonymous ones, so expand them.
    const numbered = /\?\d/.test(this.sql);
    const params: unknown[] = numbered ? [] : this.params;
    const sql = numbered
      ? this.sql.replace(/\?(\d+)/g, (_, n: string) => {
          params.push(this.params[Number(n) - 1]);
          return '?';
        })
      : this.sql;
    const statement = this.db.prepare(sql);
    if (/^\s*select/i.test(sql)) {
      return { results: statement.all(...params), meta: { changes: 0, last_row_id: 0 } };
    }
    const info = statement.run(...params);
    return { results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  async run() {
    return this.exec();
  }

  async first() {
    return this.exec().results[0] ?? null;
  }

  async all() {
    return this.exec();
  }
}

/** A fresh database with the given migration files applied in order. */
export async function createTestDb(migrations: string[]): Promise<{ env: Pick<Env, 'DB'>; db: NativeDatabase }> {
  const sqlite = 'node:sqlite';
  const fs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fs)) as { readFileSync(url: URL, enc: 'utf8'): string };
  const { DatabaseSync } = (await import(/* @vite-ignore */ sqlite)) as {
    DatabaseSync: new (path: string) => NativeDatabase;
  };
  const db = new DatabaseSync(':memory:');
  for (const file of migrations) db.exec(readFileSync(new URL(`../../migrations/${file}`, (import.meta as unknown as { url: string }).url), 'utf8'));
  const DB = {
    prepare: (sql: string) => new Statement(db, sql),
    // Like D1, a batch is one transaction: all statements apply or none does.
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => s.exec());
        db.exec('COMMIT');
        return results;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { env: { DB: DB as unknown as D1Database }, db };
}
