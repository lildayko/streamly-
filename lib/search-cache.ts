// Public search only. Never put personalized responses or OAuth tokens in this cache.
const cache = new Map<string, { expires: number; promise: Promise<unknown> }>();
let windowStart = 0;
let requests = 0;
let active = 0;
export class SearchBusyError extends Error {}
export async function cachedSearch<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.promise as Promise<T>;
  if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
  if (requests >= 60 || active >= 8) throw new SearchBusyError("Слишком много запросов. Повтори через минуту.");
  requests++;
  active++;
  const promise = load().catch(error => { cache.delete(key); throw error; }).finally(() => { active--; });
  cache.delete(key);
  cache.set(key, { expires: now + 60_000, promise });
  while (cache.size > 100) cache.delete(cache.keys().next().value!);
  return promise;
}
