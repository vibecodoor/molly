import { getDomain } from 'tldts';

/** Registrable domain of an http(s) URL (`m.youtube.com` → `youtube.com`); null for anything else. */
export function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return getDomain(u.hostname) ?? u.hostname; // IPs and `localhost` have no registrable domain
}
