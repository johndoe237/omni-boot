# omni-boot

[English version](README.en.md)

`omni-boot` est un bootstrapper Node.js éphémère pour **OmniRoute v3.8.49**. Il valide une configuration déclarative de providers, de combos et de proxies, crée les ressources via l’API locale d’OmniRoute, puis expose un `auth-gate` transparent.

> `omni-boot` est un déploiement indépendant de `FlareTunnel-Manager`. Il ne partage pas son image Docker. Lorsqu’un proxy `https` est configuré, omni-boot se connecte au listener TLS de FlareTunnel par le réseau.

## Architecture

```text
Client externe
     │ X-Omni-Boot-Key
     ▼
auth-gate :8080
     │ loopback
     ▼
OmniRoute :20128
     │ proxy HTTP / HTTPS / SOCKS5 selon la configuration
     ▼
FlareTunnel ou autre proxy
```

OmniRoute est démarré par le conteneur. `omni-boot` attend `GET /api/health/ping`, génère un secret interne en mémoire, effectue le login loopback, charge les fichiers de configuration et n’ouvre l’entrée publique qu’après le bootstrap.

## Fonctionnalités

- Support d’OmniRoute v3.8.49.
- Validation stricte des fichiers JSON de providers et de combos.
- Création dynamique d’une connexion OmniRoute par clé provider.
- Registry et assignments de proxies `http`, `https` et `socks5`.
- Support du TLS transport vers un proxy FlareTunnel avec `type: "https"`.
- Trust store Node contenant séparément les CA publics MITM et transport.
- `auth-gate` avec header secret obligatoire.
- Relais streaming avec backpressure native et sans parsing des bodies LLM.
- Mode fail-closed recommandé pour éviter les sorties directes en cas de panne proxy.

## Variables obligatoires

Le minimum opérationnel est :

```env
OMNI_BOOT_API_KEY=replace-with-a-long-random-client-secret
CUSTOM_PROVIDER_KEYS=["provider-key-1","provider-key-2"]
PROXY_FAIL_OPEN=false
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
```

`CUSTOM_PROVIDER_KEYS` est obligatoire lorsque `config/providers/custom-provider.json` est utilisé, car ce fichier référence cette variable. La liste complète des variables et des exemples se trouve dans [`DEPLOYMENT_ENV.md`](DEPLOYMENT_ENV.md).

## Providers

Chaque provider est défini dans `config/providers/*.json` :

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

`models` documente les modèles connus par la configuration. Pour chaque clé du tableau `CUSTOM_PROVIDER_KEYS`, omni-boot crée une connexion OmniRoute distincte.

Une référence `provider/model` est séparée au premier `/`. Ainsi `my-router/openai/gpt-5.6-luna` désigne le provider `my-router` et le modèle `openai/gpt-5.6-luna`.

## Combos

Chaque combo est défini dans `config/combos/*.json` :

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

Le bootstrapper traduit les modèles en étapes natives `kind: "model"` et les références en étapes `kind: "combo-ref"`. Il ne réimplémente ni le fallback ni la sélection runtime d’OmniRoute.

## Proxies

Les proxies sont fournis par la variable JSON `PROXY_SETTINGS` :

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

Les types acceptés sont `http`, `https` et `socks5`. Le type `https` établit un TLS de transport entre OmniRoute/Undici et le listener proxy. Le `CONNECT` et le TLS MITM éventuel restent à l’intérieur du tunnel.

`omni-boot` ne fait pas la rotation lui-même. Il crée les proxies via l’API OmniRoute, résout les IDs et configure les pools et stratégies natives.

## Trust TLS

L’image embarque :

```text
/app/certs/Flaretunnel-MITM-CA.crt
/app/certs/Flaretunnel-TRANSPORT-CA.crt
/app/certs/omni-trust-bundle.pem
```

`NODE_EXTRA_CA_CERTS` pointe vers `omni-trust-bundle.pem`. Le CA transport valide le certificat du listener HTTPS proxy. Le CA MITM valide les certificats de domaines interceptés. Les certificats publics sont séparés dans le dépôt ; aucune clé privée de CA n’est incluse.

Ne désactivez jamais la validation TLS avec `rejectUnauthorized: false` ou `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Auth-gate

Le client externe doit envoyer :

```http
X-Omni-Boot-Key: valeur-de-OMNI_BOOT_API_KEY
```

Un header absent ou incorrect reçoit `401`. Lorsque la valeur est correcte, le header est supprimé avant transmission vers OmniRoute. Le body et les headers de réponse sont relayés sans transformation complète.

Le chemin runtime ne parse pas les bodies LLM et ne transforme pas `{"stream":true}`. Les réponses SSE conservent leur streaming et leur backpressure native. Les timeouts de socket restent désactivés pendant les réponses longues ; les délais initiaux de headers et de body protègent contre le slowloris.

## Cycle de démarrage

1. démarrer OmniRoute ;
2. attendre `GET /api/health/ping` ;
3. charger et valider les providers et combos ;
4. générer un mot de passe interne aléatoire en mémoire ;
5. se connecter localement à OmniRoute ;
6. créer les providers et les connexions ;
7. créer et affecter les proxies ;
8. créer les combos ;
9. écouter publiquement via `auth-gate`.

Les IDs et le cookie de session restent en mémoire et disparaissent à l’arrêt du conteneur.

## Installation locale

```bash
npm ci
export OMNI_BOOT_API_KEY='client-secret-fictif'
export CUSTOM_PROVIDER_KEYS='["key-a","key-b"]'
export PROXY_FAIL_OPEN='false'
export OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK='false'
npm start
```

Pour un test sans binaire OmniRoute réel, utilisez un serveur simulé qui fournit le health-check et les routes de management attendues. Une validation end-to-end nécessite OmniRoute v3.8.49.

## Docker

```bash
docker build -t omni-boot:3.8.49 .
docker run --rm -p 8080:8080 \
  -e OMNI_BOOT_API_KEY='client-secret-fictif' \
  -e CUSTOM_PROVIDER_KEYS='["key-a","key-b"]' \
  -e PROXY_FAIL_OPEN='false' \
  -e OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK='false' \
  omni-boot:3.8.49
```

Ne publiez pas le port interne `20128`. Les secrets doivent être injectés par l’environnement du déploiement.

## Tests

```bash
npm ci
npm test
git diff --check
```

Le build Docker nécessite une machine disposant de Docker.

## Structure

```text
src/schemas/       Validation du DSL
src/bootstrap/     Chargement et orchestration
src/adapters/      Client et adaptation OmniRoute
src/authgate/      Authentification et relais transparent
config/providers/  Providers versionnés
config/combos/     Combos versionnés
certs/             Certificats publics uniquement
Dockerfile         Image OmniRoute + omni-boot
DEPLOYMENT_ENV.md  Variables de déploiement
```

## Sécurité

Utilisez un `OMNI_BOOT_API_KEY` long et aléatoire. Ne committez aucun credential provider, mot de passe proxy ou fichier `.env` réel. Conservez `PROXY_FAIL_OPEN=false` et `OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false` lorsque toute sortie directe est interdite.

`omni-boot` ne reçoit jamais la clé privée du CA MITM ou du CA transport. Ces clés restent dans le déploiement FlareTunnel-Manager.

## Références

- [OmniRoute](https://www.npmjs.com/package/omniroute)
- [Undici ProxyAgent](https://undici.nodejs.org/#/docs/api/ProxyAgent)
- [Node.js TLS](https://nodejs.org/api/tls.html)
- [FlareTunnel](https://github.com/johndoe237/FlareTunnel)

---

[Lire cette documentation en anglais](README.en.md)
