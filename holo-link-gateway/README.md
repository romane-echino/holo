# Holo Link Gateway (Vercel)

Mini passerelle HTTPS pour rendre les liens Holo cliquables dans Teams/Slack.

## Pourquoi

Les outils de chat ne rendent pas toujours `holo://...` cliquable. Cette passerelle transforme un lien HTTPS en redirection vers `holo://...`.

## Déploiement rapide (Vercel)

1. Importer ce dossier `holo-link-gateway` dans un nouveau projet Vercel.
2. Framework preset: `Other`.
3. Root directory: `holo-link-gateway`.
4. Deploy.

Tu obtiens une URL du style: `https://holo-link-gateway.vercel.app`.

## Format de lien

`https://<ton-domaine>/open?h=<URI_HOLO_URLENCODED>`

Exemple:

`https://holo-link-gateway.vercel.app/open?h=holo%3A%2F%2Fdocumentation%2FReadme.md`
