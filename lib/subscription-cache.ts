import { createHash } from 'node:crypto';
// Keys are one-way digests; tokens are never retained here. Personalized data is
// isolated by session credential and never sent through the public search cache.
const entries = new Map<string, { expires: number; data: unknown }>();
export function sessionKey(credential: string) {
  return createHash('sha256').update(credential).digest('hex');
}
export function getSubscriptions(key: string): unknown | undefined {
  const entry = entries.get(key);
  if (!entry || entry.expires <= Date.now()) { entries.delete(key); return undefined; }
  return entry.data;
}
export function storeSubscriptions(key: string, data: unknown) {
  entries.delete(key);
  entries.set(key, { expires: Date.now() + 120_000, data });
  while (entries.size > 20) entries.delete(entries.keys().next().value!);
}
