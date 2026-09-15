# omni-boot

[Version française](README.md)

`omni-boot` is an ephemeral Node.js bootstrapper for **OmniRoute v3.8.49**. It validates a declarative configuration of providers, combos, and proxies, creates resources through OmniRoute’s local API, and then exposes a transparent `auth-gate`.

> `omni-boot` is deployed independently from `FlareTunnel-Manager`. It does not share the manager Docker image. When an `https` proxy is configured, omni-boot connects over the network to FlareTunnel’s TLS listener.

## Architecture

```text
External client
     │ X-Omni-Boot-Key
     ▼
auth-gate :8080
     │ loopback
     ▼
OmniRoute :20128
     │ HTTP / HTTPS / SOCKS5 proxy according to configuration
     ▼
FlareTunnel or another proxy
```

The container starts OmniRoute. `omni-boot` waits for `GET /api/health/ping`, generates an internal in-memory secret, performs the loopback login, loads configuration files, and opens the public listener only after bootstrapping is complete.

## Features

- OmniRoute v3.8.49 support.
- Strict validation of provider and combo JSON files.
- One OmniRoute connection created dynamically for each provider key.
- `http`, `https`, and `socks5` proxy registry and assignments.
- Transport TLS to a FlareTunnel proxy through `type: "https"`.
- Node trust store containing independent public MITM and transport CAs.
- `auth-gate` with a mandatory secret header.
- Streaming relay with native backpressure and no LLM-body parsing.
- Recommended fail-closed behavior to prevent direct egress when a proxy fails.

## Required variables

The operational minimum is:

```env
OMNI_BOOT_API_KEY=replace-with-a-long-random-client-secret
CUSTOM_PROVIDER_KEYS=["provider-key-1","provider-key-2"]
PROXY_FAIL_OPEN=false
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
```

`CUSTOM_PROVIDER_KEYS` is required when `config/providers/custom-provider.json` is used because that file references the variable. The complete variable list and examples are in [`DEPLOYMENT_ENV.md`](DEPLOYMENT_ENV.md).

## Providers

Each provider is defined in `config/providers/*.json`:

```json
{
  "name": "custom-provider",
  "type": "openai-compatible",
  "baseUrl": "https://api.example.com/v1",
  "apiKeys": "CUSTOM_PROVIDER_KEYS",
  "models": ["model-a", "model-b", "openai/gpt-5.6-luna"],
  "defaultModel": "model-a"
}
```

`models` documents the models known to the configuration. For every key in `CUSTOM_PROVIDER_KEYS`, omni-boot creates a separate OmniRoute connection.

A `provider/model` reference is split at the first `/`. Thus `my-router/openai/gpt-5.6-luna` identifies provider `my-router` and model `openai/gpt-5.6-luna`.

## Combos

Each combo is defined in `config/combos/*.json`:

```json
{
  "name": "coding",
  "strategy": "priority",
  "targets": {
    "models": ["custom-provider/model-a"],
    "combos": ["custom-combo"]
  }
}
```

The bootstrapper translates models into native `kind: "model"` steps and references into `kind: "combo-ref"` steps. It does not reimplement OmniRoute’s fallback or runtime selection.

## Proxies

Proxies are supplied through the `PROXY_SETTINGS` JSON variable:

```json
{
  "registry": [
    {
      "id": "flare-transport",
      "type": "https",
      "host": "proxy.example.com",
      "port": 8080,
      "username": "proxy-user",
      "password": "proxy-password"
    }
  ],
  "assignments": [
    {
      "scope": "global",
      "scopeId": null,
      "proxyIds": ["flare-transport"],
      "strategy": "round-robin"
    }
  ]
}
```

Supported types are `http`, `https`, and `socks5`. The `https` type establishes transport TLS between OmniRoute/Undici and the proxy listener. `CONNECT` and any subsequent MITM TLS remain inside the tunnel.

`omni-boot` does not perform rotation itself. It creates proxies through OmniRoute’s API, resolves IDs, and configures native pools and strategies.

## TLS trust

The image contains:

```text
/app/certs/Flaretunnel-MITM-CA.crt
/app/certs/Flaretunnel-TRANSPORT-CA.crt
/app/certs/omni-trust-bundle.pem
```

`NODE_EXTRA_CA_CERTS` points to `omni-trust-bundle.pem`. The transport CA validates the HTTPS proxy listener certificate. The MITM CA validates certificates for intercepted domains. The public certificates remain separate in the repository, and no private CA key is included.

Never disable TLS validation with `rejectUnauthorized: false` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Auth-gate

The external client must send:

```http
X-Omni-Boot-Key: value-of-OMNI_BOOT_API_KEY
```

A missing or incorrect header receives `401`. When valid, the header is removed before forwarding to OmniRoute. The body and response headers are relayed without full buffering or transformation.

The runtime path does not parse LLM bodies or transform `{"stream":true}`. SSE responses preserve streaming and native backpressure. Socket timeouts remain disabled during long responses; initial header and body deadlines protect against slowloris behavior.

## Startup lifecycle

1. start OmniRoute;
2. wait for `GET /api/health/ping`;
3. load and validate providers and combos;
4. generate a random internal password in memory;
5. log in to OmniRoute over loopback;
6. create providers and connections;
7. create and assign proxies;
8. create combos;
9. listen publicly through `auth-gate`.

IDs and the session cookie remain in memory and disappear when the container stops.

## Local installation

```bash
npm ci
export OMNI_BOOT_API_KEY='client-secret-example'
export CUSTOM_PROVIDER_KEYS='["key-a","key-b"]'
export PROXY_FAIL_OPEN='false'
export OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK='false'
npm start
```

For a test without the real OmniRoute binary, use a mock server exposing the expected health-check and management routes. End-to-end validation requires OmniRoute v3.8.49.

## Docker

```bash
docker build -t omni-boot:3.8.49 .
docker run --rm -p 8080:8080 \
  -e OMNI_BOOT_API_KEY='client-secret-example' \
  -e CUSTOM_PROVIDER_KEYS='["key-a","key-b"]' \
  -e PROXY_FAIL_OPEN='false' \
  -e OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK='false' \
  omni-boot:3.8.49
```

Do not publish the internal port `20128`. Inject secrets through the deployment environment.

## Tests

```bash
npm ci
npm test
git diff --check
```

The Docker build requires a machine with Docker installed.

## Project structure

```text
src/schemas/       DSL validation
src/bootstrap/     Loading and orchestration
src/adapters/      OmniRoute client and adapters
src/authgate/      Authentication and transparent relay
config/providers/  Versioned providers
config/combos/     Versioned combos
certs/             Public certificates only
Dockerfile         OmniRoute + omni-boot image
DEPLOYMENT_ENV.md  Deployment variables
```

## Security

Use a long, random `OMNI_BOOT_API_KEY`. Do not commit provider credentials, proxy passwords, or real `.env` files. Keep `PROXY_FAIL_OPEN=false` and `OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false` whenever direct egress is forbidden.

`omni-boot` never receives the MITM CA or transport CA private key. Those keys remain in the FlareTunnel-Manager deployment.

## References

- [OmniRoute](https://www.npmjs.com/package/omniroute)
- [Undici ProxyAgent](https://undici.nodejs.org/#/docs/api/ProxyAgent)
- [Node.js TLS](https://nodejs.org/api/tls.html)
- [FlareTunnel](https://github.com/johndoe237/FlareTunnel)

---

[Read this documentation in French](README.md)
