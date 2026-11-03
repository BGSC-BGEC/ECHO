// World packs on disk (worlds/<id>/world.json), loaded once at startup.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WorldInfo, WorldPack } from '@echo/shared';

const DIR = process.env.ECHO_WORLDS ?? fileURLToPath(new URL('../../worlds/', import.meta.url));
export const worlds = new Map<string, WorldPack>();

export function loadWorlds(dir = DIR) {
  worlds.clear();
  if (!existsSync(dir)) return worlds;
  for (const id of readdirSync(dir)) {
    const f = `${dir}/${id}/world.json`;
    if (!existsSync(f)) continue;
    try {
      const w = JSON.parse(readFileSync(f, 'utf8')) as WorldPack;
      if (w.schema === 'echo.world/1' && w.id === id) worlds.set(id, w);
    } catch { /* skip a broken pack rather than refuse to start */ }
  }
  return worlds;
}

export const worldInfo = (w: WorldPack): WorldInfo => ({ id: w.id, name: w.name, version: w.version, hash: w.hash, center: w.center, buildings: w.buildings.length });
