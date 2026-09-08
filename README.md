# omni-boot

Bootstrapper éphémère pour **OmniRoute v3.8.49**. La configuration Git est la source de vérité ; les secrets sont uniquement fournis par variables d’environnement et les IDs OmniRoute restent en mémoire pendant le bootstrap.

## Architecture

`main.ts` lance éventuellement OmniRoute, attend son démarrage, exécute l’orchestrateur puis lance `auth-gate` sur `:8080`. OmniRoute reste lié à `127.0.0.1:20128`; seul auth-gate est publié. Le proxy est volontairement un reverse proxy HTTP transparent : il vérifie `X-Omni-Boot-Key`, supprime ce header avant transmission, et conserve les méthodes, bodies, headers de réponse et flux sans timeout métier.

L’adapter est basé sur le code réel de la release taguée `v3.8.49` (commit upstream `c9d4a45f1883d7daf150bbff631f3e83b41aa5b4`). Il utilise les routes natives `/api/provider-nodes`, `/api/providers`, `/api/combos` et `/api/v1/management/proxies`; le routage, le fallback et la rotation restent donc à OmniRoute.

## Configuration et secrets

Les providers sont sous `config/providers/<id>/` avec `provider.json`, `models.json` et `connections.json`. Les combos sont sous `config/combos/`. Un combo utilise les formes natives v3.8.49 `{"kind":"model","provider":"...","model":"..."}` et `{"kind":"combo-ref","comboName":"..."}`.

Pour chaque connection, `connections.json` référence un objet JSON d’environnement, par exemple `CUSTOM_PROVIDER_CONNECTIONS='{"a":"secret-a","b":"secret-b","c":"secret-c"}'`. Les valeurs ne sont jamais journalisées ni écrites dans le dépôt.

Variables minimales : `OMNIROUTE_API_KEY`, `AUTH_GATE_SECRET`. Variables usuelles : `OMNIROUTE_URL`, `OMNIROUTE_PORT`, `AUTH_GATE_PORT`, `AUTH_GATE_HEADER`, `OMNIROUTE_COMMAND`, `OMNI_BOOT_CONFIG`.

## Lancement

```sh
npm ci
OMNIROUTE_API_KEY=... AUTH_GATE_SECRET=... CUSTOM_PROVIDER_CONNECTIONS='{"a":"...","b":"...","c":"..."}' npm start
```

L’image Docker est conçue pour recevoir OmniRoute via `OMNIROUTE_COMMAND` ou une image/runtime d’exécution fourni par le déploiement. Cette séparation évite de prétendre qu’un binaire OmniRoute est disponible dans npm sans vérifier le mécanisme d’installation de v3.8.49.

## Tests et limites connues

`npm test` couvre la validation de graphe et l’authentification à comparaison constante. Le test d’intégration OmniRoute réel dépend d’une instance v3.8.49 et de credentials fournis au runtime ; il n’est pas exécuté par défaut. Les opérations proxy sont exposées par l’adapter mais aucune donnée de proxy n’est incluse dans l’exemple.
