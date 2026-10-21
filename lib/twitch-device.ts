import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { twitchOrigin } from './twitch-oauth';
import { saveTwitchSession, twitchApi } from './twitch-account';

type Attempt = { clientId: string; deviceCode: string; expiresAt: number; interval: number; nextPollAt: number; busy: boolean; access?: string; refresh?: string; tokenExpiresAt?: number };
const shared = globalThis as typeof globalThis & { streamlyTwitchDevices?: Map<string, Attempt> };
const attempts = shared.streamlyTwitchDevices ||= new Map<string, Attempt>();
const cookie = 'streamly_tw_device';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const form = (body: URLSearchParams) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' as const, signal: AbortSignal.timeout(15000) });
function remove(id: string, response: NextResponse) { attempts.delete(id); response.cookies.delete(cookie); return response; }

export async function twitchDevice(request: NextRequest) {
  if (request.headers.get('origin') !== twitchOrigin(request)) return json({ error: 'Недопустимый источник запроса.' }, 403);
  let action: string;
  try { const raw = await request.text(); if (raw.length > 1000) throw new Error(); action = JSON.parse(raw).action; }
  catch { return json({ error: 'Некорректный запрос входа.' }, 400); }
  const id = request.cookies.get(cookie)?.value || '';
  if (action === 'cancel') return remove(id, json({ status: 'cancelled' }));
  if (action === 'start') {
    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    if (!clientId) return json({ error: 'Для подключения нужен TWITCH_CLIENT_ID в окружении сервера.' }, 503);
    for (const [key, value] of attempts) if (value.expiresAt <= Date.now()) attempts.delete(key);
    if (attempts.size >= 50) return json({ error: 'Слишком много попыток входа. Попробуй позже.' }, 429);
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/device', form(new URLSearchParams({ client_id: clientId, scopes: 'user:read:follows' })));
      const body = await response.json();
      if (!response.ok || !body.device_code || !body.user_code || !body.verification_uri) return json({ error: 'Twitch не выдал код входа. Проверь Client ID и доступность входа по коду для приложения.' }, 502);
      const uri = new URL(body.verification_uri);
      if (uri.protocol !== 'https:' || !['www.twitch.tv', 'twitch.tv', 'id.twitch.tv'].includes(uri.hostname) || uri.port || uri.username || uri.password) throw new Error('Invalid activation host');
      const interval = Math.max(5, Math.min(60, Number(body.interval) || 5));
      const expiresAt = Date.now() + Math.min(1800, Math.max(1, Number(body.expires_in) || 600)) * 1000;
      const attemptId = randomBytes(32).toString('hex');
      // Supersede this browser's old attempt, never another browser's session.
      attempts.delete(id);
      if (attempts.size >= 50) return json({ error: 'Слишком много попыток входа. Попробуй позже.' }, 429);
      attempts.set(attemptId, { clientId, deviceCode: body.device_code, expiresAt, interval, nextPollAt: Date.now() + interval * 1000, busy: false });
      const result = json({ status: 'pending', userCode: String(body.user_code), verificationUri: uri.href, expiresAt, interval });
      result.cookies.set(cookie, attemptId, { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: Math.ceil((expiresAt - Date.now()) / 1000) });
      return result;
    } catch { return json({ error: 'Не удалось получить код Twitch. Проверь соединение сервера с id.twitch.tv.' }, 502); }
  }
  if (action !== 'poll') return json({ error: 'Неизвестное действие входа.' }, 400);
  const attempt = attempts.get(id);
  if (!attempt || attempt.expiresAt <= Date.now()) return remove(id, json({ error: 'Код входа истёк или сервер был перезапущен. Получи новый код.' }, 410));
  if (attempt.busy || Date.now() < attempt.nextPollAt) return json({ status: 'pending', interval: Math.max(1, Math.ceil((attempt.nextPollAt - Date.now()) / 1000)) });
  attempt.busy = true;
  attempt.nextPollAt = Date.now() + attempt.interval * 1000;
  try {
    if (!attempt.access) {
      const response = await fetch('https://id.twitch.tv/oauth2/token', form(new URLSearchParams({ client_id: attempt.clientId, device_code: attempt.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', scopes: 'user:read:follows' })));
      const body = await response.json();
      if (!response.ok || !body.access_token) {
        const error = String(body.error || body.message || '').toLowerCase().replace(/[ -]/g, '_');
        if (error.includes('authorization_pending')) return json({ status: 'pending', interval: attempt.interval });
        if (error.includes('slow_down')) { attempt.interval += 5; attempt.nextPollAt = Date.now() + attempt.interval * 1000; return json({ status: 'pending', interval: attempt.interval }); }
        if (error.includes('access_denied')) return remove(id, json({ error: 'Ты отклонил доступ Twitch. Получи новый код, если хочешь повторить вход.' }, 403));
        if (error.includes('expired') || error.includes('invalid_device')) return remove(id, json({ error: 'Код входа истёк. Получи новый код.' }, 410));
        if (response.status >= 500) return json({ error: 'Twitch временно недоступен. Нажми «Проверить подключение», чтобы повторить.' }, 502);
        return remove(id, json({ error: 'Twitch отклонил вход по коду. Проверь настройки приложения или используй обычный вход.' }, 400));
      }
      attempt.access = String(body.access_token);
      attempt.refresh = body.refresh_token ? String(body.refresh_token) : undefined;
      attempt.tokenExpiresAt = Date.now() + (Number(body.expires_in) || 3600) * 1000;
    }
    const profile = await twitchApi('users', attempt.access);
    if (!profile.data?.[0]?.id) throw new Error('Profile missing');
    // Cancellation/replacement may have happened while Twitch was responding.
    if (attempts.get(id) !== attempt) return json({ error: 'Эта попытка входа отменена.' }, 410);
    const result = saveTwitchSession(json({ status: 'connected', connected: true }), { access: attempt.access, refresh: attempt.refresh, expires: Math.max(1, Math.floor((attempt.tokenExpiresAt! - Date.now()) / 1000)), user: profile.data[0] }, request);
    return remove(id, result);
  } catch { return json({ error: 'Не удалось проверить подключение Twitch. Нажми «Проверить подключение», чтобы повторить.' }, 502); }
  finally { attempt.busy = false; }
}

export function cancelTwitchDevice(request: NextRequest) {
  attempts.delete(request.cookies.get(cookie)?.value || '');
}
