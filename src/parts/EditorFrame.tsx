import { useEffect, useRef, useState } from 'react'
import { Ellipsis, ExternalLink, FileText } from 'lucide-react'
import { cn } from '../utils/global'
import { MarkdownRenderer } from './MarkdownRenderer'
import { BlockEditor } from './MarkdownEditor/BlockEditor'
import { TableTest } from './TableTest'

type EditorFrameProps = {
  filepath: string
  markdown?: string
  onMarkdownChange?: (value: string) => void

  onTitleChange?: (value: string) => void
  onDescriptionChange?: (value: string) => void
  onAuthorChange?: (value: string) => void
  onCreatedAtChange?: (value: string) => void
  onUpdatedAtChange?: (value: string) => void
  onTagsChange?: (value: string[]) => void
  onIconClick?: () => void

  onShare?: () => void
  onMore?: () => void
}

function filenameFromPath(filepath: string) {
  const normalized = filepath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? filepath
}

function folderFromPath(filepath: string) {
  const normalized = filepath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/'
}

function extensionFromPath(filepath: string) {
  const filename = filenameFromPath(filepath)
  const extension = filename.split('.').at(-1)
  return extension && extension !== filename ? extension.toUpperCase() : 'FILE'
}

function EditableText({
  value,
  placeholder,
  onChange,
  className,
  multiline = false,
}: {
  value?: string
  placeholder: string
  onChange?: (value: string) => void
  className?: string
  multiline?: boolean
}) {
  if (multiline) {
    return (
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        rows={2}
        className={cn(
          'w-full resize-none rounded-holo-md border border-transparent bg-transparent px-0 py-1 text-holo-text-muted placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-holo-glass focus:px-3 focus:outline-none',
          className,
        )}
      />
    )
  }

  return (
    <input
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full rounded-holo-md border border-transparent bg-transparent px-0 py-1 text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-holo-glass focus:px-3 focus:outline-none',
        className,
      )}
    />
  )
}

function PropertyField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value?: string
  placeholder: string
  onChange?: (value: string) => void
}) {
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 rounded-holo-md px-2 py-1.5 transition hover:bg-holo-glass">
      <span className="text-xs text-holo-text-faint">{label}</span>
      <input
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-holo-sm border border-transparent bg-transparent px-0 py-1 text-sm text-holo-text-muted placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:outline-none"
      />
    </label>
  )
}

function TagsField({
  tags = [],
  onChange,
}: {
  tags?: string[]
  onChange?: (value: string[]) => void
}) {
  const value = tags.join(', ')

  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3 rounded-holo-md px-2 py-1.5 transition hover:bg-holo-glass">
      <span className="pt-1.5 text-xs text-holo-text-faint">Tags</span>
      <div className="min-w-0">
        <input
          value={value}
          onChange={(event) =>
            onChange?.(
              event.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            )
          }
          placeholder="architecture, wiki, rag"
          className="w-full rounded-holo-sm border border-transparent bg-transparent px-0 py-1 text-sm text-holo-text-muted placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:outline-none"
        />

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-holo-border-soft bg-holo-glass px-2 py-0.5 text-[11px] text-holo-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </label>
  )
}

function StickyEditorHeader({
  visible,
  icon,
  title,
  author,
  extension,
  onShare,
  onMore,
}: {
  visible: boolean
  icon?: React.ReactNode
  title: string
  author?: string
  extension: string
  onShare?: () => void
  onMore?: () => void
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-30 border-b border-holo-border-soft bg-holo-bg/10 px-5 py-3 backdrop-blur-lg transition-all duration-200',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
      )}
    >
      <div className="mx-auto flex max-w-[920px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg border border-holo-border-soft bg-holo-glass text-holo-text-muted shadow-[0_8px_28px_rgba(0,0,0,.18)]">
            {icon ?? <FileText size={14} />}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-holo-border-soft bg-holo-glass px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-holo-primary-soft">
                {extension}
              </span>
              <div className="truncate text-sm font-medium text-holo-text">{title}</div>
            </div>

            <div className="mt-0.5 truncate text-xs text-holo-text-faint">{author || 'Auteur inconnu'}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onShare}
            className="flex size-9 items-center justify-center rounded-holo-md bg-holo-primary text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.18)] transition hover:bg-holo-primary/90 active:scale-[0.98]"
            title="Share"
            aria-label="Share"
          >
            <ExternalLink size={14} />
          </button>

          <button
            onClick={onMore}
            className="flex size-9 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
            aria-label="Plus d'actions"
            title="Plus d'actions"
          >
            <Ellipsis size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function EditorFrame({
  filepath,
  markdown = '',
  onMarkdownChange,
  onTitleChange,
  onDescriptionChange,
  onAuthorChange,
  onCreatedAtChange,
  onUpdatedAtChange,
  onTagsChange,
  onIconClick,
  onShare,
  onMore,
}: EditorFrameProps) {
  const [showStickyHeader, setShowStickyHeader] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const filename = filenameFromPath(filepath)
  const folder = folderFromPath(filepath)
  const extension = extensionFromPath(filepath)
  const icon = undefined // TODO: Add file type icons based on extension
  const title = filename.replace(/\.[^/.]+$/, '') // Remove extension for title
  const description = undefined // TODO: Add support for file description/summary
  const author = undefined // TODO: Add support for file author
  const createdAt = undefined // TODO: Add support for file creation date
  const updatedAt = undefined // TODO: Add support for file modification date
  const tags: string[] = [] // TODO: Add support for file tags

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    let scrollEl: HTMLElement | null = el.parentElement
    while (scrollEl) {
      const { overflow, overflowY } = getComputedStyle(scrollEl)
      if (/auto|scroll/.test(overflow + overflowY)) break
      scrollEl = scrollEl.parentElement
    }

    if (!scrollEl) return

    const target = scrollEl
    const handleScroll = () => setShowStickyHeader(target.scrollTop > 12)

    handleScroll()
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => target.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section ref={sectionRef} className="relative min-h-full" data-editor>
      <StickyEditorHeader
        visible={showStickyHeader}
        icon={icon}
        title={title || filename}
        author={author}
        extension={extension}
        onShare={onShare}
        onMore={onMore}
      />

      <div className="mx-auto max-w-[920px] px-5 py-6 sm:px-8 md:px-10 md:py-9">
        <header className="mb-10">
          <div className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <button
              onClick={onIconClick}
              className="flex size-8 shrink-0 items-center justify-center rounded-holo-md border border-white/[0.04] bg-holo-glass text-holo-text-muted shadow-[0_10px_40px_rgba(0,0,0,.24)] transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
              title="Changer l'icône"
              aria-label="Changer l'icône"
            >
              {icon ?? <FileText size={13} />}
            </button>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full border border-holo-border-soft bg-holo-glass px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-holo-primary-soft">
                {extension}
              </span>
              <span className="truncate text-xs text-holo-text-faint">{folder}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onShare}
                className="flex size-10 items-center justify-center rounded-holo-md bg-holo-primary py-2 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition hover:bg-holo-primary/90 active:scale-[0.98]"
                title="Share"
                aria-label="Share"
              >
                <ExternalLink size={14} />
              </button>

              <button
                onClick={onMore}
                className="flex size-10 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                aria-label="Plus d'actions"
                title="Plus d'actions"
              >
                <Ellipsis size={14} />
              </button>
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-2">
            <EditableText
              value={title ?? filename}
              onChange={onTitleChange}
              placeholder="Untitled"
              className="text-[clamp(2.25rem,5vw,4rem)] font-[650] leading-[1] tracking-[-0.05em]"
            />

            <EditableText
              value={description}
              onChange={onDescriptionChange}
              placeholder="Ajouter une description…"
              multiline
              className="max-w-[720px] text-[1.02rem] leading-7"
            />
          </div>

          <div className="rounded-holo-2xl border border-holo-border-soft bg-holo-glass p-3">
            <PropertyField label="Auteur" value={author} placeholder="Auteur…" onChange={onAuthorChange} />
            <PropertyField label="Créé" value={createdAt} placeholder="Date de création…" onChange={onCreatedAtChange} />
            <PropertyField label="Modifié" value={updatedAt} placeholder="Date de modification…" onChange={onUpdatedAtChange} />
            <TagsField tags={tags} onChange={onTagsChange} />
          </div>
        </header>

        <TableTest />

        <article>
          {!markdown ? (
            <div className="grid grid-cols-2 gap-10">
              <div>
                <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-holo-text-faint">JSX reference</div>
                <div className="holo-markdown"><MarkdownVisualExample /></div>
              </div>
              <div>
                <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-holo-primary-soft">MarkdownRenderer</div>
                <MarkdownRenderer markdown={MarkdownDemo} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-10">
              <div>
                <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-holo-text-faint">JSX reference</div>
                <div className="holo-markdown"><MarkdownVisualExample /></div>
              </div>
              <div>
                <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-holo-primary-soft">Editor</div>
                <BlockEditor markdown={MarkdownDemo} onChange={onMarkdownChange ?? (() => { })} />
              </div>

            </div>
          )}
        </article>
      </div>
    </section>
  )
}

// prettier-ignore
export const MarkdownDemo = `
# Titre 1 — Document principal

Ceci est un exemple complet de rendu Markdown dans le design system Holo. Le texte est pensé pour être confortable à lire, avec une colonne centrée, beaucoup d'espace et une hiérarchie typographique claire.

Voici un [lien contextuel](#), du **texte important**, du _texte accentué_, du ~~texte barré~~ et un exemple de code inline \`git status\`.

## Titre 2 — Structure du contenu

Les titres secondaires servent à structurer la documentation sans donner une impression trop technique ou trop dense. L'objectif est de garder un rendu premium, lisible et calme.

### Titre 3 — Liste simple

- Documentation interne et durable.
- Markdown WYSIWYG avec rendu propre.
- Versioning Git visible mais simplifié.
- IA intégrée au flux d'écriture.

### Titre 3 — Nested list

- Architecture
  - Frontend
    - React
    - Electron
    - Tailwind
  - Backend
    - Git index
    - RAG pipeline
- Documentation
  - Guides
  - ADR
  - Runbooks

### Titre 3 — Liste numérotée

1. Créer ou ouvrir un repository.
2. Écrire la documentation en Markdown.
3. Synchroniser les changements automatiquement.
4. Utiliser l'IA pour améliorer, résumer ou relier les contenus.

### Checklist / Tasklist

- [x] Finaliser le rendu Markdown
- [x] Ajouter les propriétés éditables
- [ ] Brancher le vrai moteur WYSIWYG
- [ ] Générer la table des matières automatiquement

#### Titre 4 — Note contextuelle

> Le rôle de Holo n'est pas de ressembler à un IDE, mais à un espace de connaissance vivant où Git devient une timeline documentaire.

## Latex equation

Une équation inline peut s'intégrer dans le texte, par exemple $E = mc²$, tandis qu'une équation importante peut être mise en avant.

$$f(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

## Image

![Figure 1 — Exemple de bloc image dans le rendu Markdown.](https://placehold.co/920x360/0B0F16/7B61FF?text=Image+%2F+diagramme)

## Code

\`\`\`typescript
type DocumentState = {
  filepath: string
  saved: boolean
  branch: string
  modifiedAt: Date
}

function updateDocument(state: DocumentState) {
  return {
    ...state,
    saved: false,
    modifiedAt: new Date(),
  }
}
\`\`\`

## Tableau

| Élément | Rôle | Statut |
| --- | --- | --- |
| Markdown | Format principal d'écriture | Actif |
| Git | Historique et synchronisation | Synchronisé |
| IA | Résumé, liens, réécriture | Prêt |

## Tableau aligné

| Gauche | Centre | Droite |
| :--- | :---: | ---: |
| Nom | Score | 128 |
| Version | Stable | 2.0 |

---

## Footnote

Holo peut afficher des notes de bas de page discrètes, utiles pour les précisions techniques ou les références internes.[^1]

[^1]: Une footnote doit rester lisible, mais visuellement secondaire par rapport au document principal.

## Conclusion

Ce rendu doit donner l'impression d'un document vivant, lisible et versionné, tout en restant suffisamment neutre pour accueillir de vrais contenus techniques.
`

export function MarkdownVisualExample() {
  return (
    <>
      <h1 id="titre-1-document-principal">Titre 1 — Document principal</h1>

      <p>
        Ceci est un exemple complet de rendu Markdown dans le design system Holo. Le texte est pensé pour être
        confortable à lire, avec une colonne centrée, beaucoup d’espace et une hiérarchie typographique claire.
      </p>

      <p>
        Voici un <a href="#">lien contextuel</a>, du <strong>texte important</strong>, du <em>texte accentué</em>, du{' '}
        <del>texte barré</del> et un exemple de code inline <code>git status</code>.
      </p>

      <h2 id="structure-du-contenu">Titre 2 — Structure du contenu</h2>

      <p>
        Les titres secondaires servent à structurer la documentation sans donner une impression trop technique ou trop
        dense. L’objectif est de garder un rendu premium, lisible et calme.
      </p>

      <h3 id="liste-simple">Titre 3 — Liste simple</h3>

      <ul>
        <li>Documentation interne et durable.</li>
        <li>Markdown WYSIWYG avec rendu propre.</li>
        <li>Versioning Git visible mais simplifié.</li>
        <li>IA intégrée au flux d’écriture.</li>
      </ul>

      <h3 id="nested-list">Titre 3 — Nested list</h3>

      <ul>
        <li>
          Architecture
          <ul>
            <li>
              Frontend
              <ul>
                <li>React</li>
                <li>Electron</li>
                <li>Tailwind</li>
              </ul>
            </li>
            <li>
              Backend
              <ul>
                <li>Git index</li>
                <li>RAG pipeline</li>
              </ul>
            </li>
          </ul>
        </li>
        <li>
          Documentation
          <ul>
            <li>Guides</li>
            <li>ADR</li>
            <li>Runbooks</li>
          </ul>
        </li>
      </ul>

      <h3 id="liste-numerotee">Titre 3 — Liste numérotée</h3>

      <ol>
        <li>Créer ou ouvrir un repository.</li>
        <li>Écrire la documentation en Markdown.</li>
        <li>Synchroniser les changements automatiquement.</li>
        <li>Utiliser l’IA pour améliorer, résumer ou relier les contenus.</li>
      </ol>

      <h3 id="tasklist">Checklist / Tasklist</h3>

      <ul className="contains-task-list">
        <li className="task-list-item">
          <input type="checkbox" checked readOnly /> Finaliser le rendu Markdown
        </li>
        <li className="task-list-item">
          <input type="checkbox" checked readOnly /> Ajouter les propriétés éditables
        </li>
        <li className="task-list-item">
          <input type="checkbox" readOnly /> Brancher le vrai moteur WYSIWYG
        </li>
        <li className="task-list-item">
          <input type="checkbox" readOnly /> Générer la table des matières automatiquement
        </li>
      </ul>

      <h4 id="note-contextuelle">Titre 4 — Note contextuelle</h4>

      <blockquote>
        Le rôle de Holo n’est pas de ressembler à un IDE, mais à un espace de connaissance vivant où Git devient une
        timeline documentaire.
      </blockquote>

      <h2 id="latex-equation">Latex equation</h2>

      <p>
        Une équation inline peut s’intégrer dans le texte, par exemple <span className="holo-latex-inline">E = mc²</span>,
        tandis qu’une équation importante peut être mise en avant.
      </p>

      <div className="holo-latex-block">
        <span>f(x) = \int_&#123;-\infty&#125;^&#123;\infty&#125; e^&#123;-x^2&#125; dx = \sqrt&#123;\pi&#125;</span>
      </div>

      <h2 id="image">Image</h2>

      <figure>
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-holo-2xl border border-holo-border-soft bg-[radial-gradient(circle_at_50%_0%,rgba(123,97,255,.22),transparent_38rem),linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02))] shadow-[0_20px_60px_rgba(0,0,0,.25)]">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-holo-2xl bg-holo-glass">
              <i className="far fa-image text-xl text-holo-text-muted" />
            </div>
            <p className="text-sm font-medium text-holo-text">Image / diagramme</p>
            <p className="mt-1 text-xs text-holo-text-faint">Aperçu visuel intégré au document</p>
          </div>
        </div>
        <figcaption>Figure 1 — Exemple de bloc image dans le rendu Markdown.</figcaption>
      </figure>

      <h2 id="code">Code</h2>

      <pre>
        <code>{`type DocumentState = {
  filepath: string
  saved: boolean
  branch: string
  modifiedAt: Date
}

function updateDocument(state: DocumentState) {
  return {
    ...state,
    saved: false,
    modifiedAt: new Date(),
  }
}`}</code>
      </pre>

      <h2 id="tableau">Tableau</h2>

      <table>
        <thead>
          <tr>
            <th>Élément</th>
            <th>Rôle</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Markdown</td>
            <td>Format principal d’écriture</td>
            <td>Actif</td>
          </tr>
          <tr>
            <td>Git</td>
            <td>Historique et synchronisation</td>
            <td>Synchronisé</td>
          </tr>
          <tr>
            <td>IA</td>
            <td>Résumé, liens, réécriture</td>
            <td>Prêt</td>
          </tr>
        </tbody>
      </table>

      <h2 id="tableau-aligne">Tableau aligné</h2>

      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Gauche</th>
            <th style={{ textAlign: 'center' }}>Centre</th>
            <th style={{ textAlign: 'right' }}>Droite</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>Nom</td>
            <td style={{ textAlign: 'center' }}>Score</td>
            <td style={{ textAlign: 'right' }}>128</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>Version</td>
            <td style={{ textAlign: 'center' }}>Stable</td>
            <td style={{ textAlign: 'right' }}>2.0</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <h2 id="footnote">Footnote</h2>

      <p>
        Holo peut afficher des notes de bas de page discrètes, utiles pour les précisions techniques ou les références
        internes.<sup><a href="#fn-1">1</a></sup>
      </p>

      <section className="footnotes">
        <ol>
          <li id="fn-1">
            Une footnote doit rester lisible, mais visuellement secondaire par rapport au document principal.
          </li>
        </ol>
      </section>

      <h2 id="conclusion">Conclusion</h2>

      <p>
        Ce rendu doit donner l’impression d’un document vivant, lisible et versionné, tout en restant suffisamment neutre
        pour accueillir de vrais contenus techniques.
      </p>
    </>
  )
}
