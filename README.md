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

La phase Registry crée chaque proxy via `/api/v1/management/proxies` et construit une Map mémoire `omni-boot ID -> OmniRoute ID`. La phase Assignments ajoute les IDs réels aux pools via `/api/settings/proxies/pool`, puis configure la stratégie native. `omni-boot` ne fait jamais la rotation lui-même.

## Variables

Variables principales :

```text
OMNI_BOOT_API_KEY       secret attendu par auth-gate
OMNIROUTE_PORT          20128 par défaut
AUTH_GATE_PORT          8080 par défaut
OMNIROUTE_URL           http://127.0.0.1:20128 par défaut
OMNIROUTE_COMMAND       omniroute par défaut
OMNIROUTE_READY_TIMEOUT_MS 60000 par défaut
*_KEYS                  tableaux JSON de credentials provider
PROXY_SETTINGS          DSL JSON optionnel des proxies
```

Une clé de management distante n’est pas utilisée et ne doit pas être fournie. Les appels de bootstrap vont vers l’API locale OmniRoute sans header `Authorization`; v3.8.49 autorise le mode frais loopback tant qu’aucun mot de passe/OIDC n’est configuré. Si l’instance locale est configurée avec une authentification persistante, ce mode doit être explicitement adapté plutôt que contourné silencieusement.

## Lifecycle

1. démarrer OmniRoute ;
2. sonder `GET /api/health/ping` jusqu’à une réponse 2xx, sans délai fixe de readiness ;
3. charger et valider les providers et combos ;
4. créer les provider nodes ;
5. parser les variables `*_KEYS` et créer une connection par clé ;
6. créer le registry proxy, si `PROXY_SETTINGS` est fourni ;
7. résoudre les IDs proxy logiques vers les IDs OmniRoute réels ;
8. ajouter les proxies aux pools et configurer leurs stratégies ;
9. traduire et créer les combos ;
10. seulement ensuite écouter publiquement via auth-gate.

Les IDs sont en mémoire uniquement et disparaissent à la destruction du conteneur. Aucun volume ou mapping durable OmniRoute n’est requis par le projet.

## Auth-gate

Le client externe envoie :

```http
X-Omni-Boot-Key: valeur-de-OMNI_BOOT_API_KEY
```

Header absent ou incorrect : `401`. Header correct : le header est retiré, puis la requête, le body, les headers de réponse et les streams sont relayés vers OmniRoute. Auth-gate ne connaît ni les routes métier, ni les modèles, ni les combos.

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
