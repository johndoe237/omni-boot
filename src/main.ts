import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from './adapters/omniroute/client.js';
import { OmniRouteAdapter } from './adapters/omniroute/index.js';
import { bootstrap } from './bootstrap/orchestrator.js';
import { startAuthGate } from './authgate/server.js';
import { log } from './utils/logging.js';

const port = Number(process.env.OMNIROUTE_PORT || 20128);
const publicPort = Number(process.env.AUTH_GATE_PORT || 8080);
const base = process.env.OMNIROUTE_URL || `http://127.0.0.1:${port}`;
const gateSecret = process.env.OMNI_BOOT_API_KEY;
if (!gateSecret) throw new Error('OMNI_BOOT_API_KEY is required for the public auth-gate');
const runtimePassword = randomBytes(32).toString('base64url');
const client = createClient(base);
const child = spawn(process.env.OMNIROUTE_COMMAND || 'omniroute', {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    INITIAL_PASSWORD: runtimePassword,
    OMNIROUTE_PORT: String(port),
    HOSTNAME: '127.0.0.1',
  },
});
let gate: { close(): void } | undefined;
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  gate?.close();
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code, signal) => {
  if (!stopping) {
    console.error(`OmniRoute exited before shutdown (code=${code}, signal=${signal})`);
    process.exitCode = 1;
  }
});
try {
  await client.waitReady(Number(process.env.OMNIROUTE_READY_TIMEOUT_MS || 60000));
  await client.login(runtimePassword);
  await bootstrap(path.resolve(process.env.OMNI_BOOT_CONFIG || '.'), new OmniRouteAdapter(client));
  gate = startAuthGate({ port: publicPort, target: base, header: 'X-Omni-Boot-Key', secret: gateSecret });
  log.info(`bootstrap complete; auth-gate listening on ${publicPort}`);
} catch (error) {
  console.error(`[omni-boot] bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  stop();
  process.exitCode = 1;
}
