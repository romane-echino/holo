# Édition en temps réel (CRDT) avec Codenotch comme relais

État : étude de faisabilité, rien n'est implémenté.

## Verdict

Codenotch peut servir de relais et de stockage **sans modifier le runtime**. Il suffit d'un
projet Codenotch `holo` composé de quelques processus éphémères (routes d'API) et de deux ou
trois tables. Les signaux Codenotch (SSE pour la réception, POST pour l'envoi) couvrent le
besoin, avec trois limites :

- pas de WebSocket ;
- pas de rejeu après une reconnexion ;
- chaque signal est écrit en base SQL.

Ces limites se contournent côté client.

## Principe

- **Yjs** (CRDT) côté Holo : chaque document ouvert à plusieurs est un `Y.Doc`.
- Les modifications locales produisent des *updates* Yjs. Elles sont regroupées toutes les
  100 à 250 ms (`Y.mergeUpdates`) et envoyées à Codenotch.
- Codenotch les diffuse aux autres participants abonnés au document et les journalise.
- **Git reste la persistance et l'historique.** Le fichier Markdown sur disque reste la
  source de vérité partagée. La fusion à l'écriture (`fs:write-document`) protège déjà
  contre les écrasements. Le temps réel ne fait qu'éviter les divergences pendant une
  session commune.

## Projet Codenotch `holo`

| Table | Contenu |
| --- | --- |
| `HoloDocument` | `Id`, `Workspace` (URL du dépôt), `Path`, `State` (base64 de `encodeStateAsUpdate`), `Version` (`p.version()`), `UpdatedAt` |
| `HoloUpdate` | `Id`, `DocumentId`, `Update` (base64), `ClientId`, `At` (journal compacté périodiquement) |
| `HoloMember` | `Workspace`, `UserId`, `Role` (politique `rls`) |

| Route (éphémère, `auth: internal`) | Rôle |
| --- | --- |
| `GET /holo/api/docs/{id}/stream` | `ctx.streamSignals(['holo.doc.<id>'])`, flux SSE (updates + présence) |
| `POST /holo/api/docs/{id}/updates` | insère un `HoloUpdate` puis `sendSignal('holo.doc.<id>.update', …)` |
| `POST /holo/api/docs/{id}/awareness` | présence et curseurs : `sendSignal` seul, rien n'est stocké |
| `GET /holo/api/docs/{id}/state` | état compacté + updates postérieurs |
| `PUT /holo/api/docs/{id}/state` | compaction avec contrôle de version (`expectedVersion`) |

Les appels partent du **processus principal d'Electron** (pas de problème CORS) avec un jeton
API Codenotch lié à l'utilisateur (`CN_…`, portée `process:*@holo:start`). Le contrôle d'accès
se fait par espace, en vérifiant `HoloMember` avant chaque abonnement ou envoi.

**Reconnexion.** À chaque évènement `ready` du flux, le client recharge `state` puis renvoie
`encodeStateAsUpdate(doc, stateVectorServeur)`. L'application d'un update Yjs étant
idempotente, aucun trou n'est possible, même après la fermeture horaire du flux ou un client
décroché parce qu'il avait 256 évènements de retard.

## Côté Holo

1. **Liaison éditeur ↔ Yjs.** L'éditeur de blocs est maison (pas ProseMirror). Il y a deux
   options :
   - un `Y.Text` par document contenant le Markdown, avec des diffs texte appliqués dans les
     deux sens ;
   - un `Y.Array` de blocs, chacun portant un `Y.Text` Markdown.

   Recommandation : la seconde. Elle s'appuie sur la réconciliation par bloc déjà en place
   (`reconcileBlocks`, mise à jour externe sans remontage), qui conserve le focus et le
   curseur dans les blocs que les autres ne touchent pas.
2. **Présence** : avatars des participants dans l'en-tête du document, surlignage du bloc
   édité par chacun (protocole *awareness* de Yjs).
3. **Écriture disque et git** : un seul participant à la fois, l'« écrivain » désigné par la
   présence (le plus ancien connecté), écrit et commite. Les autres n'écrivent que s'ils
   restent seuls, ce qui évite N commits identiques.
4. **Hors-ligne** : rien ne change par rapport à aujourd'hui (fusion git à la synchronisation).

## Risques et points ouverts

- **Latence et charge :** chaque envoi passe par une requête HTTP, une exécution V8, deux
  insertions SQL et le journal des signaux (30 jours). Le regroupement côté client est
  indispensable. La cible de 100 à 500 ms est plausible mais **non mesurée**.
- **Optimisation possible** côté runtime (seule modification envisageable) : un
  `ctx.broadcast(ref, payload)` volatil, qui ne passerait ni par le journal ni par les
  webhooks.
- **Maturité :** Codenotch est en bêta fermée, et une licence de production est nécessaire
  avec un fournisseur d'identité.
- **Espace de signaux partagé** entre projets : utiliser le préfixe `holo.` et un runtime
  dédié.

## Découpage proposé

1. Projet Codenotch `holo` (tables + 5 routes) et un banc de mesure de latence.
2. Client Yjs dans le processus principal (flux SSE, envoi groupé, reconnexion).
3. Liaison avec l'éditeur de blocs et présence.
4. Coordination de l'écrivain disque et git, tests à plusieurs instances, comme
   `tests/e2e/gitConcurrentEdit.spec.ts`.
