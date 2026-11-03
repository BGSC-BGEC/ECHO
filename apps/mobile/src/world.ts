// Fetch the match's world pack once per hash (public map data, ~80 KB) and keep it in memory.
import { useEffect, useState } from 'react';
import type { WorldPack } from '@echo/shared';
import { useNet } from './net';

const cache = new Map<string, WorldPack>(); // hash -> pack

export function useWorldPack(info?: { id: string; hash: string }): WorldPack | undefined {
  const { serverUrl, status } = useNet();
  const [tries, bump] = useState(0);
  const cached = info ? cache.get(info.hash) : undefined;
  useEffect(() => {
    if (!info || cache.has(info.hash) || !serverUrl) return;
    let alive = true;
    const url = serverUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '') + `/worlds/${info.id}`;
    let retry: ReturnType<typeof setTimeout> | undefined;
    fetch(url).then(r => (r.ok ? r.json() : null)).then((w: WorldPack | null) => {
      if (w && w.hash === info.hash) { cache.set(w.hash, w); if (alive) bump(n => n + 1); }
      else throw new Error('stale');
    }).catch(() => { // Wi-Fi blip: try again a few times (the game still works on the plain map meanwhile)
      if (alive && tries < 5) retry = setTimeout(() => bump(n => n + 1), 3000 * (tries + 1));
    });
    return () => { alive = false; clearTimeout(retry); };
  }, [info?.id, info?.hash, serverUrl, tries, status === 'open']);
  return cached;
}
