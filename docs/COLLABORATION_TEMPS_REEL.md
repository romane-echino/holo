# Édition en temps réel (CRDT) avec Codenotch comme relais

État : **version 2 implémentée** (document partagé bloc par bloc, depuis la 0.9).

- Relais : [holo-realtime/](../holo-realtime/README.md).
- Client : `electron/realtime.js` (transport), `src/lib/realtime/sharedModel.ts` (modèle
  partagé), `src/lib/realtime/blockSession.ts` (session Yjs) et
  `src/hooks/useRealtimeDocument.ts`.
- Tests : `sharedModel.spec.ts` et `blockSession.spec.ts` (sans relais réel),
  `realtimeCollab`, `realtimeTeamDocument`, `realtimeAllCommands`, `realtimeSelection`,
  `realtimeWindows` (plusieurs instances de Holo) ; `realtimeChaos` et `realtimeStress` à la demande.

La section « Implémentation » plus bas décrit les choix faits. Le reste de ce document est
l'étude initiale.

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

## Implémentation

**Document partagé (v2).** Le document est un arbre de blocs Yjs :

| Racine | Contenu |
| --- | --- |
| `frontmatter` | `Y.Text`, l'en-tête YAML |
| `footnotes` | `Y.Map<Y.Text>`, les notes de bas de page |
| `order` | `Y.Array<id>`, l'ordre des blocs |
| `blocks` | `Y.Map<Y.Map>`, le contenu de chaque bloc |

Un bloc texte (paragraphe, titre, citation, code, formule…) porte son Markdown dans un
`Y.Text`. Un tableau a ses colonnes et ses lignes (ordre + contenu par identifiant) et un
`Y.Text` par cellule. Une liste a ses éléments, chacun avec son texte, son niveau et sa case à
cocher. L'ordre est séparé du contenu : déplacer un bloc, trier un tableau ou réordonner une
liste ne touche que l'ordre, si bien qu'une saisie en cours n'est jamais perdue.

L'éditeur décrit le document par une photo (blocs avec leurs identifiants) ; une saisie locale
est la différence entre deux photos, appliquée aux seuls blocs, cellules ou éléments qui ont
changé. Dans un même texte, la fusion se fait au caractère près.

La v1 partageait un seul `Y.Text` contenant tout le Markdown. Elle est retirée : une structure
modifiée pendant qu'un collègue tapait (tableau trié, bloc déplacé) pouvait mélanger les
saisies. Les identifiants de documents ont changé (`document-v2`), si bien qu'une 0.8 et une
0.9 ne rejoignent pas la même session.

**Identité.** `UUID v5(URL du dépôt + chemin du fichier)`, calculé par chaque poste. Seuls les
espaces liés à un dépôt distant sont partagés.

**Jonction.**
- Personne n'est établi sur le document : le poste redémarre la session à partir de son fichier
  (`PUT /state` avec `reset`, nouvelle époque). C'est git qui fait foi.
- Des participants sont établis : le poste adopte leur état et y fusionne ses éventuelles
  modifications locales, bloc par bloc. La base est l'état Yjs que le poste a gardé de la
  session (chiffré, enregistré toutes les 300 ms), ce qui évite tout doublon après une
  fermeture ou un plantage ; à défaut, la dernière version poussée du fichier. Un ajout que la
  session contient déjà (tapé avant qu'elle ne redémarre) n'est pas ajouté une seconde fois.
- Deux arrivées simultanées sont départagées par la version du document : le second reçoit
  `409` et rejoint la session du premier.

**Reconnexion.** À chaque évènement `ready`, le poste recharge l'état. Il rejoue ce qui lui
manque, puis renvoie ce qui manque au serveur (vecteur d'état). Si l'époque a changé, il
rejoint à neuf.

**Disque et git.** Chaque participant continue d'écrire (fusion 3 voies) et de committer comme
d'habitude. Le document partagé garde la liste de tous ceux qui ont rejoint la session (même
hors ligne ou relancés) : un commit reçu de l'un d'eux est un instantané de l'état partagé, et la
synchronisation garde alors le fichier en direct tel quel au lieu de réinjecter cette version
plus ancienne. Les commits des participants contiennent les mêmes modifications, mais à des
instants différents : rejouer ceux de l'un sur ceux de l'autre (rebase) peut buter sur des
états intermédiaires. Dans ce cas la synchronisation fusionne les états finaux. Un conflit sur
un document en direct se résout avec la version locale, l'état partagé, qui contient déjà les
modifications des autres. Le résultat est un seul commit au-dessus du distant. Tout autre
conflit annule l'opération, comme avant.

**Modifications venues du disque** (pull git d'un collègue hors session, OneDrive). Chaque
participant les reçoit. Seul le meneur, le plus petit identifiant de présence, les réinjecte
dans la session, sinon elles seraient insérées en double. Chez les autres, la fusion à
l'écriture les préserve sur disque jusqu'à ce qu'elles arrivent par la session. La
réinjection ne porte que la différence entre la version du disque que Holo connaissait et la
nouvelle (fusion en trois points) : ce qu'un collègue vient de taper, pas encore enregistré,
reste. Un changement vu pendant une écriture ou une synchronisation git est revérifié quand
elle se termine, et un fichier écrit qui contient autre chose que ce que l'éditeur a envoyé
(changement externe fusionné à l'écriture) est réinjecté de la même façon.

**Présence.** Le protocole *awareness* de Yjs porte sur un document dédié, stable pendant
toute la session. L'en-tête du document affiche les avatars et l'état (« En direct »,
« Reconnexion… »). Le curseur partagé donne l'identifiant du bloc (le rang seulement pour les
versions ≤ 0.9.3), le champ et la position : le bloc, la cellule ou l'élément de liste où se
trouve un collègue est encadré à sa couleur, et cliquer sur son avatar y fait défiler.

**Mises à jour reçues dans l'éditeur.** Elles sont appliquées par identifiant : seuls les
blocs changés sont redessinés, et un tableau ou une liste ne met à jour que la cellule ou
l'élément changé. Avant d'appliquer une modification reçue, la session attache le curseur au
caractère qui le précède (position relative Yjs) ; après, il est remis à la nouvelle place de
ce caractère, en tenant compte de la syntaxe Markdown invisible à l'écran. Si un collègue tape
exactement au même endroit, chacun garde sa propre saisie d'un seul tenant. Une sélection est
ancrée de la même façon, par son premier et son dernier caractère : elle reste sur le même texte.

**Présence dans les espaces.** Chaque espace partagé a son propre canal sur le relais :
identifiant `HMAC(clé du dépôt, "space")`, présence chiffrée comme celle des documents, aucun
contenu. Chaque poste y publie son identité, s'il a l'espace affiché et le document qu'il a
ouvert. La liste des espaces montre qui est dans chaque espace et l'arborescence montre qui a
quel fichier ouvert. Les chemins sont comparés après normalisation (séparateurs, « / » final,
casse sous Windows, accents) et un collègue qui a un document de l'espace ouvert y est
présent. Depuis la 0.9.4, chaque poste y publie aussi sa version et le format des documents en
direct : un collègue qui a le document ouvert sans être dans la session depuis 10 secondes
est signalé dans l'en-tête (« hors direct »), avec la raison. Les canaux sont limités à
quatre espaces, l'espace affiché en premier.
Après chaque envoi git, le poste le signale sur ce canal. Les autres récupèrent aussitôt s'il
s'agit de fichiers ajoutés, supprimés ou renommés, et au plus toutes les 15 secondes pour une
simple modification. L'arborescence se recharge quand le dossier change sur le disque (pull,
Finder, OneDrive). Un dossier créé dans Holo contient un `.gitkeep` pour exister dans git.

**Images.** Elles sont rangées dans `images/` à la racine de l'espace et le lien est relatif au
document (`../images/photo.png`), lisible par Gitea ou GitHub. Les anciens liens relatifs à la
racine restent lus. Une image ajoutée par un collègue s'affiche dès que la synchronisation
l'a récupérée.

**Configuration.** Elle se fait dans **Paramètres → Collaboration** et est propre à chaque
poste : adresse du relais, jeton chiffré avec `safeStorage`.

**Diagnostic.** Le journal `<données de l'app>/logs/holo.log` reçoit les erreurs du processus
principal et de l'interface, les coupures et refus du relais, et les changements d'état du
document en direct et des canaux d'espace. **Paramètres → Application → Copier le
diagnostic** donne la version, le système, le serveur, l'état de la session et de chaque
canal d'espace (ce que le poste publie, qui il voit) et les dernières lignes du journal ; ni
contenu de document ni jeton.

**Tests.** En plus des scénarios ciblés : `HOLO_CHAOS_SECONDS=90` (trois personnes, coupures,
plantage, synchronisations git ; `HOLO_CHAOS_LATENCY_MS=150` ajoute 150 à 300 ms de latence
dans chaque sens), `HOLO_STRESS_URL` (charge du relais) et `HOLO_PERF=1` (document de 2 000
blocs : dans l'application installée, frappe p95 19 ms, enregistrement après une pause
168 ms).

### Limites connues

- La compaction n'a lieu qu'à la jonction, au-delà de 200 modifications en attente.
- Pas de contrôle d'accès par espace sur le relais. Les routes sont publiques. Le contenu est
  chiffré et les identifiants sont dérivés d'une clé que seuls les clones du dépôt connaissent.
- Une ligne vide n'existe pas en Markdown : elle est partagée pendant la session mais n'est
  pas enregistrée dans le fichier, et disparaît à la réouverture du document.
- Deux personnes qui tapent au même instant exactement au même endroit d'un texte voient leurs
  saisies l'une à côté de l'autre, dans un ordre que rien ne permet de choisir.
- Les liens d'images écrits avant la 0.8 sont relatifs à la racine de l'espace. Holo les
  affiche, mais Gitea ne les trouve pas pour un document rangé dans un sous-dossier.
