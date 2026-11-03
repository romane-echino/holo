# holo-realtime — relais d'édition en temps réel

Projet Codenotch qui relaie les modifications des documents Holo ouverts par plusieurs personnes
en même temps. Holo garde le document (Yjs) côté poste. Le relais se contente de diffuser les
modifications, de les journaliser pour ceux qui arrivent en cours de session et de stocker un
état compacté. Il n'interprète jamais le contenu. Git reste la persistance des documents.

Conception : [docs/COLLABORATION_TEMPS_REEL.md](../docs/COLLABORATION_TEMPS_REEL.md).

## Ce que contient le projet

| Élément | Rôle |
| --- | --- |
| `tables/holo-document.table.ts` | Un document : identifiant dérivé de l'URL du dépôt et du chemin, état Yjs compacté, époque de session |
| `tables/holo-update.table.ts` | Journal des modifications depuis la dernière compaction |
| `GET /docs/{id}/stream` | Flux SSE : modifications (`holo.doc.<id>.update`) et présence (`holo.doc.<id>.awareness`) |
| `POST /docs/{id}/updates` | Enregistre et diffuse une modification |
| `POST /docs/{id}/awareness` | Diffuse la présence d'un participant (rien n'est stocké) |
| `GET /docs/{id}/state` | État compacté et modifications suivantes, pour rejoindre une session |
| `PUT /docs/{id}/state` | Compaction, ou redémarrage de la session (`reset`) par un participant seul |

Les routes sont **publiques**, sans jeton ni compte.
- **Contenu chiffré :** chaque poste chiffre tout ce qu'il envoie en AES-GCM avec une clé
  dérivée du dépôt git (URL et premier commit). Le relais ne stocke et ne diffuse que du
  chiffré.
- **Identifiants indevinables :** ils sont dérivés de cette même clé. Seules les personnes qui
  ont un clone du dépôt peuvent rejoindre un document.

## En local

```bash
cd holo-realtime
npm install
cn project start --no-open      # compile et déploie sur le runtime local (http://127.0.0.1:5005)
```

Dans Holo, ouvrir **Paramètres → Collaboration** avec l'adresse
`http://127.0.0.1:5005/holo-realtime`. Aucun jeton n'est nécessaire.

Le test de bout en bout `tests/e2e/realtimeCollab.spec.ts` lance deux instances Holo sur ce
relais local.

## Sur cn.echino.com

La CLI ne déploie que sur le runtime local. Pour un serveur, on installe le paquet.

1. Vérifier que le runtime du serveur a la même version que `@codenotch/process` dans
   `package.json` (actuellement 1.2.3). Sinon :
   `npm install -D @codenotch/process@<version> && npm install @codenotch/orm@<version> @codenotch/react@<version>`.
2. Construire le paquet : `cn project package`. Le zip est écrit dans `.codenotch/`.
3. Installer le paquet de l'une de ces deux façons :
   - **Portail :** `https://cn.echino.com/portal` → **Projects** → **Install project** →
     **Upload**, déposer le zip, puis **Install**. Garder le nom `holo_realtime` et l'uri
     `holo-realtime`.
   - **Script**, avec un jeton administrateur de portée `tenant:projects:read,write` :

     ```bash
     curl -X POST "https://cn.echino.com/project/upload" \
       -H "Authorization: Bearer <jeton-admin>" \
       -F "file=@.codenotch/<paquet>.zip" -F "serviceName=holo_realtime"
     ```

4. Pour chaque collègue, il n'y a rien à créer dans le portail. Au premier démarrage, Holo
   demande l'adresse du serveur : saisir `https://cn.echino.com/holo-realtime`. On peut la
   modifier ensuite dans **Paramètres → Collaboration**.

Les signaux du runtime sont partagés entre projets : ceux du relais sont préfixés par `holo.doc.`.
