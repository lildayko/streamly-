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

export const twitchOAuthVersion = 'oauth-4';
export const twitchOAuthStages = ['configuration', 'authorization', 'callback', 'token', 'profile', 'network'] as const;
// Only fixed OAuth error codes are displayed; never reflect provider descriptions,
// codes, client secrets, tokens, or arbitrary callback parameters into the page.
export function twitchAuthorizationError(error: string | null, description: string | null) {
  const message = `${error || ''} ${description || ''}`.toLowerCase();
  if (message.includes('redirect')) return 'redirect_mismatch';
  if (error === 'access_denied') return 'access_denied';
  if (message.includes('scope')) return 'invalid_scope';
  if (error === 'unauthorized_client') return 'unauthorized_client';
  if (message.includes('client')) return 'authorize_client_invalid';
  if (error === 'unsupported_response_type') return 'unsupported_response_type';
  if (error === 'invalid_request') return 'invalid_request';
  if (error === 'server_error' || error === 'temporarily_unavailable') return 'provider_unavailable';
  return 'authorization_error';
}
Object.assign(twitchLoginErrors, {
  authorize_client_invalid: 'Twitch отклонил Client ID на этапе открытия входа. Проверь Client ID и состояние приложения в Twitch Developer Console. Client Secret на этом шаге ещё не отправляется.',
  unauthorized_client: 'Twitch не разрешает этому приложению использовать выбранный способ входа. Проверь тип приложения в Twitch Developer Console.',
  invalid_scope: 'Twitch отклонил разрешение user:read:follows. Проверь, что вход запускается через актуальную версию Streamly и используется приложение Twitch.',
  unsupported_response_type: 'Twitch отклонил способ входа. Streamly использует Authorization Code Flow; проверь настройки типа приложения Twitch.',
  invalid_request: 'Twitch отклонил параметры запроса авторизации. Открой диагностику ниже и проверь точный адрес возврата.',
  provider_unavailable: 'Сервис авторизации Twitch временно недоступен. Повтори вход позже.',
  authorization_error: 'Twitch отказал до выдачи кода авторизации. Открой диагностику ниже: проблема возникла на странице авторизации Twitch.',
});
