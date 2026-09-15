# Variables d’environnement de déploiement

Ce document décrit les variables utilisées par `omni-boot` et celles transmises au processus enfant **OmniRoute v3.8.49**.

Les secrets et les configurations JSON doivent être injectés par la plateforme de déploiement — PaaS, VPS, Docker Compose ou environnement local — et ne doivent jamais être commités dans Git.

> `OMNI_BOOT_API_KEY` protège l’entrée publique `auth-gate`. Il est différent du mot de passe interne d’OmniRoute, généré automatiquement en mémoire par `omni-boot`.

## Variables publiques et internes

### Auth-gate

```env
OMNI_BOOT_API_KEY=replace-with-a-long-random-client-secret
```

Secret obligatoire présenté par le client dans le header `X-Omni-Boot-Key`. Toute requête sans ce header ou avec une valeur incorrecte reçoit `401 Unauthorized`.

### Clés des providers

Chaque provider JSON référence une variable `*_KEYS` dans son champ `apiKeys`. La valeur doit être un tableau JSON non vide composé de chaînes non vides.

```env
CUSTOM_PROVIDER_KEYS=["provider-key-1","provider-key-2"]
OPENAI_KEYS=["sk-example-1"]
ANTHROPIC_KEYS=["key-example-1","key-example-2"]
```

Une connexion OmniRoute est créée pour chaque clé. Les variables effectivement obligatoires dépendent des fichiers présents dans `config/providers/*.json`.

### Registry proxy

`PROXY_SETTINGS` est optionnelle. Elle devient nécessaire si la configuration doit créer et affecter des proxies OmniRoute.

```env
PROXY_SETTINGS={"registry":[{"id":"proxy-eu-1","type":"https","host":"proxy.example.net","port":8080,"username":"proxy-user","password":"proxy-password"}],"assignments":[{"scope":"global","scopeId":null,"proxyIds":["proxy-eu-1"],"strategy":"round-robin"}]}
```

Les types supportés sont `http`, `https` et `socks5`. Le type `https` correspond au TLS de transport entre OmniRoute et le listener FlareTunnel. Les CA publics MITM et transport sont embarqués dans l’image ; aucune clé privée de CA n’est fournie à omni-boot.

### Fail-closed recommandé

```env
PROXY_FAIL_OPEN=false
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
```

Ces variables doivent rester à `false` lorsqu’une requête ne doit jamais contourner son proxy assigné.

### Ports et démarrage

```env
OMNIROUTE_PORT=20128
AUTH_GATE_PORT=8080
OMNIROUTE_URL=http://127.0.0.1:20128
OMNIROUTE_COMMAND=omniroute
OMNIROUTE_READY_TIMEOUT_MS=60000
OMNI_BOOT_CONFIG=.
```

Les valeurs par défaut sont respectivement `20128`, `8080`, `http://127.0.0.1:20128`, `omniroute`, `60000` millisecondes et `.`.

`OMNIROUTE_PORT` et `OMNIROUTE_URL` doivent normalement rester internes au conteneur. Le port public à exposer est `AUTH_GATE_PORT`.

## Variables générées par omni-boot

Ne configurez pas ces variables :

```text
INITIAL_PASSWORD=<généré à chaque démarrage>
HOSTNAME=127.0.0.1
```

`INITIAL_PASSWORD` est transmis uniquement au processus enfant OmniRoute puis utilisé pour le login loopback. Le cookie de session reste en mémoire. `HOSTNAME=127.0.0.1` maintient OmniRoute sur le loopback interne dans le déploiement standard.

## Exemple Docker

```bash
docker build -t omni-boot:3.8.49 .
docker run --rm -p 8080:8080 \
  -e OMNI_BOOT_API_KEY='replace-with-a-long-random-client-secret' \
  -e CUSTOM_PROVIDER_KEYS='["provider-key-1","provider-key-2"]' \
  -e PROXY_FAIL_OPEN='false' \
  -e OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK='false' \
  omni-boot:3.8.49
```

Ne publiez pas le port interne `20128`. Utilisez le gestionnaire de secrets de la plateforme pour les clés provider, l’API key du gate et les credentials proxy.

## Sécurité TLS

Le bundle Node créé dans l’image contient les deux certificats publics :

```text
/app/certs/Flaretunnel-MITM-CA.crt
/app/certs/Flaretunnel-TRANSPORT-CA.crt
/app/certs/omni-trust-bundle.pem
```

`NODE_EXTRA_CA_CERTS` pointe vers le bundle. Le CA transport valide le certificat du proxy HTTPS. Le CA MITM valide les certificats des domaines interceptés. Les deux CA restent conceptuellement indépendants et aucune clé privée n’est embarquée.

Ne désactivez jamais la validation TLS. N’utilisez pas `rejectUnauthorized: false` ni `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Auth-gate et streaming

Le client externe doit envoyer :

```http
X-Omni-Boot-Key: valeur-de-OMNI_BOOT_API_KEY
```

Le header est supprimé avant la transmission vers OmniRoute. Le body, les headers utiles et les streams sont relayés sans parsing ni buffering complet. Les réponses SSE et les réponses LLM longues conservent leur backpressure native.

Les headers initiaux sont protégés contre le slowloris. Les timeouts de socket restent désactivés pendant les réponses longues.

## Tests

```bash
npm ci
npm test
```

Le build Docker doit être effectué sur une machine disposant de Docker :

```bash
docker build -t omni-boot:test .
```

## Section obligatoire des variables d’environnement

Chaque ligne ci-dessous correspond à une variable obligatoire. Les variables conditionnelles sont obligatoires lorsqu’un fichier de configuration les référence ou lorsqu’un proxy est utilisé.

```env
OMNI_BOOT_API_KEY=replace-with-a-long-random-client-secret
CUSTOM_PROVIDER_KEYS=["provider-key-1","provider-key-2"]                         # obligatoire si config/providers/custom-provider.json est utilisé
PROXY_SETTINGS={"registry":[{"id":"proxy-eu-1","type":"https","host":"proxy.example.net","port":8080,"username":"proxy-user","password":"proxy-password"}],"assignments":[{"scope":"global","scopeId":null,"proxyIds":["proxy-eu-1"],"strategy":"round-robin"}]} # obligatoire si un proxy est utilisé
PROXY_FAIL_OPEN=false
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
```
