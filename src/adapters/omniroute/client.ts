import type { OmniRouteClient } from './types.js';

export function createClient(baseUrl: string): OmniRouteClient {
  let cookie = '';
  return {
    async request(path, init = {}) {
      const response = await fetch(new URL(path, baseUrl), {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(init.headers || {}),
        },
      });
      const text = await response.text();
      let body: unknown;
      try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
      if (!response.ok) {
        throw new Error(`OmniRoute ${response.status} on ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      }
      return body;
    },
    async login(password: string) {
      const response = await fetch(new URL('/api/auth/login', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`OmniRoute runtime login failed (${response.status}): ${text.slice(0, 300)}`);
      const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
      const setCookie = cookies[0] || response.headers.get('set-cookie') || '';
      cookie = setCookie.split(';', 1)[0];
      if (!cookie) throw new Error('OmniRoute runtime login returned no auth cookie');
    },
    async waitReady(timeoutMs = 60000) {
      const deadline = Date.now() + timeoutMs;
      let last = '';
      while (Date.now() < deadline) {
        try {
          const response = await fetch(new URL('/api/health/ping', baseUrl), { signal: AbortSignal.timeout(2000) });
          if (response.ok) return;
          last = `HTTP ${response.status}`;
        } catch (error) { last = error instanceof Error ? error.message : String(error); }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error(`OmniRoute readiness timeout after ${timeoutMs}ms${last ? `: ${last}` : ''}`);
    },
  };
}
