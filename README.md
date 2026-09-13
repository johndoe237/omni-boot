# omni-boot

Bootstrapper éphémère pour **OmniRoute v3.8.49**. L’utilisateur décrit des providers et des combos dans le DSL `omni-boot`; le runtime valide cette configuration, crée les ressources via l’API locale d’OmniRoute, puis publie uniquement un `auth-gate` transparent.

## Architecture

```text
Internet -> auth-gate 0.0.0.0:8080 -> OmniRoute 127.0.0.1:20128
```

Le conteneur lance deux processus : OmniRoute et le runtime Node `omni-boot`. L’entrée publique n’est ouverte qu’après le health-check réel `GET /api/health/ping`, la validation et le bootstrap. Aucun Caddy ni reverse proxy supplémentaire n’est utilisé.

## DSL providers

Un fichier par provider sous `config/providers/*.json` :

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

`models` est une liste indicative de modèles connus par la configuration. Elle n’est pas un catalogue exhaustif et aucun custom-model artificiel n’est créé. Pour chaque clé de `CUSTOM_PROVIDER_KEYS`, `omni-boot` crée dynamiquement une connection OmniRoute.

```sh
CUSTOM_PROVIDER_KEYS='["key-a","key-b","key-c"]'
```

Les références `provider/model` sont séparées uniquement sur le premier `/`. Ainsi `my-router/openai/gpt-5.6-luna` signifie provider `my-router` et modèle `openai/gpt-5.6-luna`.

## DSL combos

Un fichier par combo sous `config/combos/*.json` :

```json
{
  "name": "coding",
  "strategy": "priority",
  "targets": {
    "models": ["custom-provider/model-a"],
    "combos": ["custom-combo", "free-combo"]
  }
}
```

Le bootstrapper traduit `targets.models` en `ComboStep` natifs `kind: "model"` et `targets.combos` en `kind: "combo-ref"`. Il ne réimplémente ni fallback, ni rotation, ni sélection runtime.

## Proxies

Il n’existe volontairement ni configuration proxy dans Git ni fichier séparé de connections. Les proxies viennent exclusivement de `PROXY_SETTINGS` :

```json
{
  "registry": [
    {"id":"proxy-us-1","type":"http","host":"proxy.example.com","port":8080,"username":"user","password":"secret"}
  ],
  "assignments": [
    {"scope":"global","scopeId":null,"proxyIds":["proxy-us-1"],"strategy":"round-robin"}
  ]
}
```

La phase Registry crée chaque proxy via `/api/settings/proxies` et construit une Map mémoire `omni-boot ID -> OmniRoute ID`. La phase Assignments ajoute les IDs réels aux pools via `PUT /api/settings/proxies/pool`, puis configure la stratégie native. `omni-boot` ne fait jamais la rotation lui-même. Dans OmniRoute v3.8.49, ce `PUT` ajoute un membre idempotent à la position suivante ; il ne remplace pas les membres existants.

## Variables

Variables principales :

```text
OMNI_BOOT_API_KEY       secret client obligatoire pour auth-gate (ce n’est pas la clé interne OmniRoute)
OMNIROUTE_PORT          20128 par défaut
AUTH_GATE_PORT          8080 par défaut
OMNIROUTE_URL           http://127.0.0.1:20128 par défaut
OMNIROUTE_COMMAND       omniroute par défaut
OMNIROUTE_READY_TIMEOUT_MS 60000 par défaut
*_KEYS                  tableaux JSON de credentials provider
PROXY_SETTINGS          DSL JSON optionnel des proxies
```

L’image embarque le certificat public partagé `certs/Flaretunnel-CA.crt` et
configure automatiquement `NODE_EXTRA_CA_CERTS` pour Node.js et le processus
OmniRoute. Aucun chemin de certificat ni clé privée FlareTunnel ne doit être
fourni à `omni-boot`.

L’utilisateur ne fournit aucune clé de management OmniRoute. Au démarrage, omni-boot génère un mot de passe aléatoire en mémoire, le transmet uniquement à son processus enfant OmniRoute via `INITIAL_PASSWORD`, attend le health-check, puis réalise `POST /api/auth/login` en loopback et conserve uniquement le cookie de session en mémoire. Ce secret n’est ni affiché ni exposé par auth-gate ; un nouveau conteneur en génère un nouveau. Le code n’envoie pas de clé `Authorization` utilisateur aux APIs de management.

## Lifecycle

1. démarrer OmniRoute ;
2. sonder `GET /api/health/ping` jusqu’à une réponse 2xx, sans délai fixe de readiness ;
3. charger et valider les providers et combos ;
4. se connecter localement à OmniRoute avec le secret runtime généré ;
5. créer les provider nodes ;
6. parser les variables `*_KEYS` et créer une connection par clé ;
7. créer le registry proxy, si `PROXY_SETTINGS` est fourni ;
8. résoudre les IDs proxy logiques vers les IDs OmniRoute réels ;
9. ajouter les proxies aux pools et configurer leurs stratégies ;
10. traduire et créer les combos ;
11. seulement ensuite écouter publiquement via auth-gate.

Les IDs sont en mémoire uniquement et disparaissent à la destruction du conteneur. Aucun volume ou mapping durable OmniRoute n’est requis par le projet.

## Auth-gate

Le client externe envoie :

```http
X-Omni-Boot-Key: valeur-de-OMNI_BOOT_API_KEY
```

Header absent ou incorrect : `401`. Header correct : le header est retiré, puis
la requête, le body, les headers de réponse et les streams sont relayés vers
OmniRoute. Auth-gate ne met pas en buffer les réponses et ne parse pas les
événements SSE ; les headers spécifiques aux fournisseurs LLM sont conservés.
Les timeouts HTTP du gate sont désactivés pour permettre les réponses longues.
Auth-gate ne connaît ni les routes métier, ni les modèles, ni les combos.

## Exécution locale

```sh
npm ci
export OMNI_BOOT_API_KEY='client-secret-fictif'
export CUSTOM_PROVIDER_KEYS='["key-a","key-b"]'
export OMNIROUTE_COMMAND='omniroute'
npm start
```

Pour une simulation sans binaire OmniRoute, utilisez un faux serveur qui expose `/api/health/ping` et les routes de management attendues, puis lancez `OMNIROUTE_COMMAND` vers ce serveur de test. Une instance réelle v3.8.49 est requise pour valider les appels end-to-end.

## Docker

Le Dockerfile installe explicitement `omniroute@3.8.49`, compile `omni-boot`, copie `config/` et n’expose que `8080` :

```sh
docker build -t omni-boot:3.8.49 .
docker run --rm -p 8080:8080 \
  -e OMNI_BOOT_API_KEY='client-secret-fictif' \
  -e CUSTOM_PROVIDER_KEYS='["key-a","key-b"]' \
  omni-boot:3.8.49
```

Ne publiez pas le port `20128`. Les secrets sont injectés par l’environnement du déploiement, jamais par Git.

## Tests

```sh
npm test
```

Les tests couvrent le DSL provider/combo/proxy, les variables `*_KEYS`, plusieurs connections, les model IDs contenant `/`, les références de combos, la traduction vers ComboStep, le health-check réel simulé, l’auth-gate, la suppression du header et le streaming.

Le build Docker doit être exécuté dans un environnement disposant de Docker. Le sandbox de développement utilisé pour la release précédente ne fournissait pas la commande Docker.

### Limites de sécurité d’AuthGate

AuthGate conserve la backpressure native de Node.js : `req.pipe(upstream)` suspend la lecture lorsque le socket upstream ne peut plus recevoir, et `upstreamResponse.pipe(res)` suspend la lecture de la réponse lorsque le client public lit lentement. Aucun parsing, logging du body ou transformation de flux n’est effectué.

Les timeouts de socket restent désactivés pendant une réponse SSE active. En revanche, la réception initiale est protégée contre le slowloris par un délai de 60 secondes pour les headers et de 120 secondes pour la réception du body. Le déploiement doit également utiliser l’authentification du gate et, si nécessaire, une protection réseau du PaaS ou un rate limiting en amont.

OmniRoute v3.8.49 utilise un fetch basé sur `undici` pour le chemin proxy standard. Un test Node 22 avec un serveur HTTPS local signé par une CA additionnelle a confirmé que `NODE_EXTRA_CA_CERTS` permet à ce fetch de vérifier le certificat. Le mode optionnel `ENABLE_TLS_FINGERPRINT=true` utilise toutefois un client TLS distinct (`wreq-js`) ; ce mode doit être testé séparément avant d’être combiné avec un CA MITM privé.
