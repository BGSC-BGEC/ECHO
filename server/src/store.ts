// Crash-safe snapshots of live matches in SQLite (Node built-in, no dependency).
// ponytail: whole-match JSON blob per row, written at most every 2 s; switch to normalized Postgres (TDD §26) if multi-process.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Lobby, Match } from './game.ts';

export function openStore(path: string, lobby: Lobby, send: ConstructorParameters<typeof Lobby>[0]) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS matches (code TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const upsert = db.prepare('INSERT INTO matches (code, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at');
  const del = db.prepare('DELETE FROM matches WHERE code = ?');

  const now = Date.now();
  let restored = 0;
  for (const row of db.prepare('SELECT json, updated_at FROM matches').all() as { json: string; updated_at: number }[]) {
    try { lobby.restore(Match.fromJSON(JSON.parse(row.json), send, now, row.updated_at)); restored++; } catch { /* skip corrupt row */ }
  }
  lobby.onCritical = m => { upsert.run(m.code, JSON.stringify(m), Date.now()); m.dirty = false; };
  lobby.onDelete = code => del.run(code);

  const flush = () => {
    const t = Date.now();
    for (const m of lobby.matches.values()) if (m.dirty) { upsert.run(m.code, JSON.stringify(m), t); m.dirty = false; }
  };
  const timer = setInterval(flush, 2000);
  return { restored, flush, close: () => { clearInterval(timer); flush(); db.close(); } };
}
