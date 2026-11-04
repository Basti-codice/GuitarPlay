import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

const parse = (): Route => {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q ?? ''), raw };
};

let cur = parse();
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  cur = parse();
  subs.forEach((s) => s());
});

export const useRoute = () => useSyncExternalStore((fn) => (subs.add(fn), () => subs.delete(fn)), () => cur);

export function navigate(to: string) {
  const h = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash === h) return;
  window.location.hash = h;
}

export const href = (to: string) => `#${to}`;
