import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { startAuthGate } from '../src/authgate/server.js';

test('auth-gate forwards body and streams while removing its auth header', async (t) => {
  const upstream = http.createServer((req, res) => {
    assert.equal(req.headers['x-omni-boot-key'], undefined);
    assert.equal(req.headers['x-api-key'], 'provider-key');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write(`received:${body}|`);
      setTimeout(() => { res.end('done'); }, 20);
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  const gate = startAuthGate({ port: 0, target: `http://127.0.0.1:${upstreamPort}`, header: 'X-Omni-Boot-Key', secret: 'secret' });
  await new Promise<void>((resolve) => gate.once('listening', resolve));
  const gatePort = (gate.address() as AddressInfo).port;
  t.after(() => { gate.close(); upstream.close(); });
  const unauthorized = await fetch(`http://127.0.0.1:${gatePort}/x`);
  assert.equal(unauthorized.status, 401);
  const response = await fetch(`http://127.0.0.1:${gatePort}/x`, { method: 'POST', headers: { 'X-Omni-Boot-Key': 'secret', 'content-type': 'text/plain', 'x-api-key': 'provider-key', 'anthropic-version': '2023-06-01' }, body: 'payload' });
  assert.equal(response.status, 200);
  const reader = response.body?.getReader();
  assert.ok(reader);
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), 'received:payload|');
  const second = await reader.read();
  assert.equal(new TextDecoder().decode(second.value), 'done');
  assert.equal((await reader.read()).done, true);
});
