import type { NextRequest } from 'next/server';
export function twitchOrigin(request: NextRequest) {
  // NextURL normalizes loopback IPs to localhost; cookies do not. HTTP Host
  // retains the browser's actual origin. Do not trust forwarded host headers.
  const host = request.headers.get('host');
  if (!host) return request.nextUrl.origin;
  const url = new URL(`${request.nextUrl.protocol}//${host}`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid request host');
  return url.origin;
}
export function twitchRedirect(request: NextRequest) {
  const uri = process.env.TWITCH_REDIRECT_URI || `${twitchOrigin(request)}/api/twitch/callback`;
  const url = new URL(uri);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/api/twitch/callback' || url.search || url.hash) throw new Error('Invalid Twitch redirect URI');
  return url;
}
export const twitchLoginErrors: Record<string, string> = {
  missing_config: 'Для входа Twitch нужны TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET в окружении сервера.',
  redirect_config: 'TWITCH_REDIRECT_URI должен быть полным адресом /api/twitch/callback. Проверь его в настройках приложения Twitch.',
  access_denied: 'Ты отменил доступ Twitch. Нажми «Подключить Twitch», чтобы повторить вход.',
  state_missing: 'Сессия входа Twitch потеряна или истекла. Начни вход заново на том же адресе сайта; localhost и 127.0.0.1 используют разные cookies.',
  state_mismatch: 'Ответ Twitch относится к другой попытке входа. Закрой лишние вкладки входа и начни заново.',
  missing_code: 'Twitch не вернул код авторизации. Начни вход заново.',
  redirect_mismatch: 'Адрес возврата не совпал. OAuth Redirect URLs в Twitch должен точно совпадать с TWITCH_REDIRECT_URI, включая порт и /api/twitch/callback.',
  invalid_client: 'Twitch отклонил Client ID или Client Secret. Проверь, что оба значения принадлежат одному приложению, и перезапусти сервер.',
  code_expired: 'Код Twitch истёк или уже использован. Начни новую попытку входа.',
  token_error: 'Twitch не выдал токен доступа. Повтори вход; при повторении проверь настройки приложения Twitch.',
  profile_error: 'Токен получен, но Twitch не смог загрузить профиль. Повтори вход позже.',
  network_error: 'Сервер Streamly не смог связаться с Twitch. Проверь доступ сервера к id.twitch.tv и api.twitch.tv и повтори вход.',
  connect_error: 'Вход Twitch не завершён. Начни новую попытку входа.',
};
