export type Signal = { id: string | number; title: string; category?: string; creator?: string; platform?: string };
export type Candidate = Signal & { channelId?: string; reason?: string };
const ignored = new Set('видео подписки стримы youtube twitch видео vk для тебя это как что или про все всё меня мой моя смотреть новый новые the and with this from'.split(' '));
export function words(value: string) {
  return (value.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 2 && !ignored.has(word));
}
export function interestTopics(interests: string[], history: Signal[]) {
  const counts = new Map<string, number>();
  history.slice(0, 20).forEach((item, index) => {
    for (const word of new Set(words(`${item.title} ${item.category || ''}`))) counts.set(word, (counts.get(word) || 0) + 1 / (1 + index / 5));
  });
  const inferred = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([word]) => word);
  return [...new Set([...interests, ...inferred, 'наука', 'путешествия', 'технологии'])].slice(0, 8);
}
export function rankRecommendations<T extends Candidate>(items: T[], history: Signal[], subscribed: string[], topic: string) {
  const seen = new Set(history.map(item => String(item.id)));
  const known = new Set(subscribed);
  const affinities = new Set(words(history.map(item => `${item.title} ${item.category || ''}`).join(' ')));
  const topics = new Set(words(topic));
  const creators = new Map<string, number>();
  const candidates = [...new Map(items.map(item => [String(item.id), item])).values()].filter(item => !seen.has(String(item.id)));
  const score = (item: T) => words(`${item.title} ${item.category || ''}`).reduce((sum, word) => sum + (affinities.has(word) ? 2 : 0) + (topics.has(word) ? 3 : 0), 0) + (known.has(item.channelId || '') ? 0 : 2);
  candidates.sort((a, b) => score(b) - score(a));
  // Round-robin creators so a single channel cannot occupy the whole top of the feed.
  const selected: T[] = [], deferred: T[] = [];
  for (const item of candidates) {
    const key = `${item.platform}:${item.channelId || item.creator}`;
    const count = creators.get(key) || 0;
    (count < 2 ? selected : deferred).push(item);
    creators.set(key, count + 1);
  }
  return [...selected, ...deferred].map(item => ({ ...item, reason: item.reason || `${known.has(item.channelId || '') ? 'По теме' : 'Новый автор · тема'}: ${topic}` }));
}
