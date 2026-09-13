import http, { type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import { validHeader } from './authentication.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function forwardHeaders(headers: IncomingHttpHeaders, authHeader: string): IncomingHttpHeaders {
  const result: IncomingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === authHeader.toLowerCase() || HOP_BY_HOP_HEADERS.has(lower)) continue;
    result[name] = value;
  }
  return result;
}

function failResponse(res: ServerResponse, status: number, message: string): void {
  if (!res.headersSent) res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

export function startAuthGate(opts: { port: number; target: string; header: string; secret: string }): Server {
  const target = new URL(opts.target);
  const authHeader = opts.header.toLowerCase();
  const server = http.createServer((req, res) => {
    if (!validHeader(req.headers[authHeader] as string | undefined, opts.secret)) {
      failResponse(res, 401, 'Unauthorized');
      return;
    }

    const upstream = http.request({
      hostname: target.hostname,
      port: target.port,
      path: req.url || '/',
      method: req.method,
      headers: forwardHeaders(req.headers, authHeader),
      agent: false,
    }, (upstreamResponse) => {
      const responseHeaders = forwardHeaders(upstreamResponse.headers, '');
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.statusMessage, responseHeaders);
      // Do not buffer or parse the body. Node streams each upstream chunk to
      // the client, which is required for SSE token delivery.
      upstreamResponse.pipe(res, { end: true });
    });

    upstream.on('error', (error) => {
      if (!res.headersSent) failResponse(res, 502, 'Bad Gateway');
      else res.destroy(error);
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream, { end: true });
  });

  // AuthGate is a long-lived streaming endpoint. Disable Node's default
  // request/socket timeouts so an active LLM/SSE response is not cut off.
  server.requestTimeout = 0;
  server.timeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 0;
  server.listen(opts.port, '0.0.0.0');
  return server;
}
