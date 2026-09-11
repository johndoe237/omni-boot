# Variables d’environnement de déploiement

Ce fichier liste les variables attendues par `omni-boot` et celles transmises au processus enfant **OmniRoute v3.8.49**.

Les secrets et les configurations JSON doivent être injectés par la plateforme de déploiement — Railway, VPS, Docker Compose ou environnement local — et ne doivent pas être commités dans Git.

> **Important :** `OMNI_BOOT_API_KEY` protège l’entrée publique `auth-gate`. Il est différent du mot de passe interne runtime d’OmniRoute, généré automatiquement par `omni-boot` et jamais fourni par l’utilisateur.

=================================

```text
OMNI_BOOT_API_KEY=change-me
```

Secret obligatoire présenté par le client dans le header `X-Omni-Boot-Key`. Toute requête sans ce header ou avec une valeur incorrecte reçoit `401 Unauthorized`.

La valeur doit être longue, aléatoire et stockée comme secret PaaS. Elle n’est pas transmise à OmniRoute comme secret de management.

=================================

```text
CUSTOM_PROVIDER_KEYS=["provider-key-1","provider-key-2"]
```

Exemple de variable `*_KEYS` référencée par le fichier provider correspondant, par exemple `config/providers/custom-provider.json` avec `"apiKeys": "CUSTOM_PROVIDER_KEYS"`.

La valeur doit être un tableau JSON non vide contenant uniquement des chaînes non vides. Une connexion OmniRoute est créée pour chaque clé.

Autres exemples valides :

```text
OPENAI_KEYS=["sk-example-1"]
ANTHROPIC_KEYS=["key-example-1","key-example-2"]
```

=================================

```text
PROXY_SETTINGS={"registry":[],"assignments":[]}
```

Configuration JSON optionnelle des proxies. `registry` contient les proxies à créer et `assignments` les affectations par scope.

Les scopes supportés par OmniRoute v3.8.49 sont notamment :

```text
global
provider
account
combo
```

Pour les scopes autres que `global`, `scopeId` doit identifier la ressource cible. La résolution des proxies suit le contexte de la connexion : compte/connexion, provider, combo selon le flux, puis global.

Exemple :

```json
{
  "registry": [
    {
      "id": "proxy-eu-1",
      "type": "http",
      "host": "proxy.example.net",
      "port": 8080,
      "username": "proxy-user",
      "password": "proxy-password"
    }
  ],
  "assignments": [
    {
      "scope": "global",
      "scopeId": null,
      "proxyIds": ["proxy-eu-1"],
      "strategy": "round-robin"
    }
  ]
}
```

=================================

```text
PROXY_FAIL_OPEN=false
```

Contrôle le comportement lorsqu’une affectation proxy existe mais que le proxy ne peut plus être résolu ou devient indisponible.

Valeurs possibles :

```text
false
true
```

Avec `false` — valeur recommandée — OmniRoute reste **fail-closed** : la requête échoue et ne bascule pas vers la connexion directe. Cela évite une fuite de l’adresse IP réelle.

Avec `true`, OmniRoute autorise le fallback direct lorsqu’un proxy assigné ne peut pas être résolu. La requête peut alors sortir directement avec l’adresse IP du serveur.

Cette variable est transmise à OmniRoute et concerne les requêtes egress soumises à une affectation proxy, quel que soit le scope effectif (`global`, `provider`, `account` ou `combo`).

=================================

```text
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
```

Contrôle le fallback direct de certains flux de control plane lorsque le pré-check d’un proxy échoue.

Valeurs possibles :

```text
false
true
```

Les flux concernés comprennent notamment OAuth, la validation de providers et certains tests de connexion. Pour éviter toute sortie directe pendant ces opérations, conserver `false`.

Cette variable est distincte de `PROXY_FAIL_OPEN` : la première concerne le control plane ; la seconde concerne le comportement fail-open/fail-closed de la résolution egress avec une affectation proxy.

=================================

```text
OMNIROUTE_PORT=20128
```

Port interne utilisé par OmniRoute. Il ne doit normalement pas être publié directement. `omni-boot` le transmet aussi à OmniRoute et utilise la même valeur pour ses appels loopback.

Valeur par défaut : `20128`.

=================================

```text
AUTH_GATE_PORT=8080
```

Port public écouté par l’auth-gate. Sur un PaaS qui fournit une variable `PORT`, configurer la plateforme pour injecter cette valeur dans `AUTH_GATE_PORT`, ou définir explicitement `AUTH_GATE_PORT` avec le port public attendu.

Valeur par défaut : `8080`.

=================================

```text
OMNIROUTE_URL=http://127.0.0.1:20128
```

URL interne utilisée par omni-boot pour attendre le health-check, effectuer le login runtime et appeler les APIs locales d’OmniRoute.

Valeur par défaut : `http://127.0.0.1:20128`. Cette URL doit rester interne au conteneur dans le déploiement standard.

=================================

```text
OMNIROUTE_COMMAND=omniroute
```

Commande utilisée pour démarrer OmniRoute. Dans l’image officielle construite par le Dockerfile, le paquet npm `omniroute@3.8.49` fournit cette commande.

Valeur par défaut : `omniroute`.

=================================

```text
OMNIROUTE_READY_TIMEOUT_MS=60000
```

Durée maximale d’attente du health-check `GET /api/health/ping` avant l’échec du bootstrap.

Valeur par défaut : `60000` millisecondes. Augmenter cette valeur sur un PaaS lent ou soumis à un cold start important.

=================================

```text
OMNI_BOOT_CONFIG=.
```

Répertoire racine de configuration utilisé par omni-boot. Le runtime y cherche :

```text
config/providers/*.json
config/combos/*.json
```

Valeur par défaut : `.`. Dans l’image Docker, la configuration versionnée est copiée dans `/app/config` et la valeur par défaut est donc adaptée au répertoire de travail `/app`.

=================================

## Variables internes générées par omni-boot

Ces variables ne doivent pas être fournies par l’utilisateur :

```text
INITIAL_PASSWORD=<généré à chaque démarrage>
HOSTNAME=127.0.0.1
```

`INITIAL_PASSWORD` est généré aléatoirement par omni-boot, transmis uniquement au processus enfant OmniRoute, puis utilisé pour effectuer le login local. Il ne doit pas être configuré dans Railway, Docker Compose ou un VPS.

`HOSTNAME=127.0.0.1` force l’instance OmniRoute enfant à rester liée au loopback interne dans le déploiement standard.

=================================

## Jeu minimal d’exemple

```text
OMNI_BOOT_API_KEY=replace-with-a-long-random-client-secret
CUSTOM_PROVIDER_KEYS=["provider-key-for-ci"]
PROXY_FAIL_OPEN=false
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
AUTH_GATE_PORT=8080
```

`PROXY_SETTINGS` peut être omis si aucun proxy n’est requis. Dans ce cas, aucun proxy n’est créé ni affecté par omni-boot.

=================================

## Règle de sécurité recommandée

Pour un déploiement où une requête ne doit jamais sortir directement lorsque son proxy assigné tombe :

```text
PROXY_FAIL_OPEN=false
OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK=false
```

Les deux valeurs `false` doivent rester explicites dans les secrets ou variables de déploiement afin de rendre l’intention opérationnelle visible, même si elles correspondent aux valeurs par défaut documentées.
