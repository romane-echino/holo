import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  ChevronRight,
  Database,
  KeyRound,
  Palette,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { cn } from '../utils/global'
import { CHANGELOG_ENTRIES } from '../constants/changelog'

type SettingsTab = 'profile' | 'storage' | 'ai' | 'appearance' | 'about'

export type HoloSettingsValue = {
  firstName?: string
  lastName?: string
  gitEmail?: string

  imageStorageMode?: 'local' | 'azure' | 's3' | 'dropbox' | 'gdrive'
  azureContainerUrl?: string
  azureSasToken?: string
  s3Region?: string
  s3Bucket?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Endpoint?: string
  s3PublicBaseUrl?: string
  dropboxAccessToken?: string
  dropboxFolderPath?: string
  gdriveAccessToken?: string
  gdriveFolderId?: string

  aiProvider?: 'gemini' | 'openai' | 'local'
  geminiApiKey?: string
  openAiApiKey?: string
  systemPrompt?: string

  theme?: 'dark' | 'light' | 'system'
  accent?: 'violet' | 'blue' | 'cyan'
}

export type SpaceCredentials = {
  azureContainerUrl?: string
  azureSasToken?: string
  s3Region?: string
  s3Bucket?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Endpoint?: string
  s3PublicBaseUrl?: string
  dropboxAccessToken?: string
  dropboxFolderPath?: string
  gdriveAccessToken?: string
  gdriveFolderId?: string
}

export type HoloSettingsDialogProps = {
  open: boolean
  value?: HoloSettingsValue
  saved?: boolean
  spaces?: string[]
  currentSpace?: string
  onChange?: (value: HoloSettingsValue) => void
  onSave?: (value: HoloSettingsValue) => void
  onSaveSpaceConfig?: (spacePath: string, mode: string, credentials: SpaceCredentials) => Promise<void>
  onClose?: () => void
}

const defaultValue: HoloSettingsValue = {
  imageStorageMode: 'local',
  azureContainerUrl: '',
  azureSasToken: '',
  s3Region: '',
  s3Bucket: '',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  s3Endpoint: '',
  s3PublicBaseUrl: '',
  dropboxAccessToken: '',
  dropboxFolderPath: '',
  gdriveAccessToken: '',
  gdriveFolderId: '',
  aiProvider: 'gemini',
  geminiApiKey: '',
  openAiApiKey: '',
  systemPrompt:
    'Tu es un assistant qui aide à rédiger de la documentation technique en Markdown. Réponds toujours en Markdown bien structuré, avec des titres, listes et code blocks si nécessaire.',
  theme: 'dark',
  accent: 'violet',
}

const tabs: Array<{
  id: SettingsTab
  label: string
  description: string
  icon: React.ReactNode
}> = [
  { id: 'profile', label: 'Profil', description: 'Identité et Git', icon: <UserRound size={16} /> },
  { id: 'storage', label: 'Espace', description: 'Stockage & images', icon: <Database size={16} /> },
  { id: 'ai', label: 'IA', description: 'Providers et prompt', icon: <Bot size={16} /> },
  { id: 'appearance', label: 'Apparence', description: 'Thème et accent', icon: <Palette size={16} /> },
  { id: 'about', label: 'Application', description: 'Version et changelog', icon: <Settings size={16} /> },
]

function Field({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-holo-text">{label}</span>
      {description && <span className="mb-2 block text-xs leading-5 text-holo-text-faint">{description}</span>}
      {children}
    </label>
  )
}

const inputClassName =
  'w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-2.5 text-sm text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-primary/40 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none'

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-holo-2xl border border-holo-border-soft bg-white/[0.018] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
      <div className="mb-5 flex items-start gap-3">
        {icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg bg-holo-primary-surface text-holo-primary-soft">
            {icon}
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-holo-text">{title}</h3>
          {description && <p className="mt-1 text-xs leading-5 text-holo-text-faint">{description}</p>}
        </div>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  )
}

const selectClassName =
  'w-full rounded-holo-lg border border-holo-border-soft bg-holo-bg px-3 py-2.5 text-sm text-holo-text transition focus:border-holo-primary/40 focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none'

function Select({
  value,
  onChange,
  options,
}: {
  value?: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClassName}
      style={{ colorScheme: 'dark' }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-holo-bg text-holo-text">
          {option.label}
        </option>
      ))}
    </select>
  )
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <KeyRound
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-holo-text-faint"
      />
      <input
        type="password"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? '••••••••'}
        className={cn(inputClassName, 'pl-9')}
      />
    </div>
  )
}

function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-holo-lg border px-3 py-2 text-sm transition active:scale-[0.98]',
        active
          ? 'border-holo-primary/30 bg-holo-primary-surface text-holo-primary-soft'
          : 'border-holo-border-soft bg-holo-glass text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
      )}
    >
      {active && <Check size={13} />}
      {children}
    </button>
  )
}

export function HoloSettingsDialog({
  open,
  value,
  saved,
  spaces,
  currentSpace,
  onChange,
  onSave,
  onSaveSpaceConfig,
  onClose,
}: HoloSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [draft, setDraft] = useState<HoloSettingsValue>({ ...defaultValue, ...value })
  const [confirmReset, setConfirmReset] = useState(false)
  const [selectedSpace, setSelectedSpace] = useState<string>(currentSpace ?? '')
  const [spaceImageMode, setSpaceImageMode] = useState<string>('local')
  const [spaceCredentials, setSpaceCredentials] = useState<SpaceCredentials>({})
  const [spaceConfigLoading, setSpaceConfigLoading] = useState(false)
  const [spaceConfigSaving, setSpaceConfigSaving] = useState(false)

  // Resynchronise le draft depuis value à chaque ouverture du dialog
  // (le composant reste monté quand fermé, donc useState n'est pas réinitialisé)
  useEffect(() => {
    if (open) {
      setDraft({ ...defaultValue, ...value })
      setSelectedSpace(currentSpace ?? spaces?.[0] ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Charge la config image du space sélectionné (mode depuis .holo.json, identifiants depuis app config)
  useEffect(() => {
    if (!selectedSpace || !open) return
    setSpaceConfigLoading(true)
    Promise.all([
      window.holo?.readSpaceConfig(selectedSpace).catch(() => null),
      window.holo?.getHoloConfig().catch(() => ({})),
    ]).then(([spaceCfg, appCfg]) => {
      const mode = (spaceCfg as any)?.imageStorageMode ?? 'local'
      setSpaceImageMode(['local', 'azure', 's3', 'dropbox', 'gdrive'].includes(mode) ? mode : 'local')
      const allCreds = (appCfg as any)?.['space-credentials'] ?? {}
      const creds: SpaceCredentials = allCreds[selectedSpace] ?? {}
      setSpaceCredentials(creds)
    })
    .catch(() => { setSpaceImageMode('local'); setSpaceCredentials({}) })
    .finally(() => setSpaceConfigLoading(false))
  }, [selectedSpace, open])

  const activeTabMeta = useMemo(() => tabs.find((tab) => tab.id === activeTab) ?? tabs[0], [activeTab])

  if (!open) return null

  const update = (patch: Partial<HoloSettingsValue>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onChange?.(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Fermer les paramètres"
        className="absolute inset-0 bg-black/62 backdrop-blur-xl"
        onClick={onClose}
      />

      <section className="relative z-10 flex h-[min(760px,calc(100vh-2rem))] w-full max-w-[980px] overflow-hidden rounded-[1.7rem] border border-holo-border-soft bg-holo-bg/92 shadow-[0_30px_110px_rgba(0,0,0,.58),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
        <aside className="hidden w-[260px] shrink-0 border-r border-holo-border-soft bg-white/[0.018] p-4 md:block">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-holo-xl bg-holo-primary text-white shadow-holo-glow">
              <Settings size={18} />
            </div>

            <div>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-holo-text">Paramètres</h2>
              <p className="text-xs text-holo-text-faint">Configuration Holo</p>
            </div>
          </div>

          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-holo-xl px-3 py-3 text-left transition',
                  activeTab === tab.id
                    ? 'bg-holo-primary-surface text-holo-primary-soft ring-1 ring-holo-primary/20'
                    : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                )}
              >
                <span className="flex size-8 items-center justify-center rounded-holo-lg bg-white/[0.025]">
                  {tab.icon}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{tab.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-holo-text-faint">{tab.description}</span>
                </span>

                <ChevronRight
                  size={14}
                  className={cn('opacity-0 transition group-hover:opacity-100', activeTab === tab.id && 'opacity-100')}
                />
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-holo-border-soft px-5 md:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-holo-primary-soft">{activeTabMeta.icon}</span>
                <h2 className="truncate text-base font-semibold text-holo-text">{activeTabMeta.label}</h2>
              </div>
              <p className="mt-0.5 hidden text-xs text-holo-text-faint sm:block">{activeTabMeta.description}</p>
            </div>

            <button
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              aria-label="Fermer"
            >
              <X size={17} />
            </button>
          </header>

          <div className="border-b border-holo-border-soft px-4 py-3 md:hidden">
            <div className="holo-scrollbar flex gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'whitespace-nowrap rounded-holo-lg px-3 py-2 text-sm transition',
                    activeTab === tab.id
                      ? 'bg-holo-primary-surface text-holo-primary-soft'
                      : 'bg-holo-glass text-holo-text-muted',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <main className="holo-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-7">
            {activeTab === 'profile' && (
              <Section
                title="Identité"
                description="Ces informations peuvent être utilisées pour les métadonnées des documents et les snapshots."
                icon={<UserRound size={16} />}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Prénom">
                    <input
                      value={draft.firstName ?? ''}
                      onChange={(event) => update({ firstName: event.target.value })}
                      placeholder="Maria"
                      className={inputClassName}
                    />
                  </Field>

                  <Field label="Nom">
                    <input
                      value={draft.lastName ?? ''}
                      onChange={(event) => update({ lastName: event.target.value })}
                      placeholder="Bernasconi"
                      className={inputClassName}
                    />
                  </Field>
                </div>

                <Field label="Email Git" description="Utilisé pour identifier l’auteur des changements.">
                  <input
                    value={draft.gitEmail ?? ''}
                    onChange={(event) => update({ gitEmail: event.target.value })}
                    placeholder="maria@example.com"
                    className={inputClassName}
                  />
                </Field>
              </Section>
            )}

            {activeTab === 'storage' && (
              <div className="space-y-5">
                <Section
                  title="Paramètres de l’espace"
                  description="Le mode de stockage est commité dans .holo.json. Les identifiants restent locaux sur cette machine."
                  icon={<Database size={16} />}
                >
                  {spaces && spaces.length > 0 ? (
                    <>
                      <Field label="Espace">
                        <Select
                          value={selectedSpace}
                          onChange={setSelectedSpace}
                          options={spaces.map((s) => ({ value: s, label: s.split('/').at(-1) || s }))}
                        />
                      </Field>

                      <Field label="Mode de stockage des images">
                        {spaceConfigLoading ? (
                          <p className="text-xs text-holo-text-faint">Chargement…</p>
                        ) : (
                          <Select
                            value={spaceImageMode}
                            onChange={setSpaceImageMode}
                            options={[
                              { value: 'local', label: 'Local — dans le dépôt (images/)' },
                              { value: 'azure', label: 'Azure Blob Storage (SAS)' },
                              { value: 's3', label: 'Amazon S3 / compatible' },
                              { value: 'dropbox', label: 'Dropbox' },
                              { value: 'gdrive', label: 'Google Drive' },
                            ]}
                          />
                        )}
                      </Field>

                      {spaceImageMode !== 'local' && !spaceConfigLoading && (
                        <div className="rounded-holo-xl border border-holo-border-soft bg-white/[0.018] p-4 space-y-4">
                          <div className="flex items-center gap-2 mb-1">
                            <KeyRound size={14} className="text-holo-primary-soft" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-holo-text-muted">
                              Identifiants — stockés localement
                            </span>
                          </div>

                          {spaceImageMode === 'azure' && (
                            <>
                              <Field label="Azure container URL">
                                <input
                                  value={spaceCredentials.azureContainerUrl ?? ''}
                                  onChange={(e) => setSpaceCredentials((p) => ({ ...p, azureContainerUrl: e.target.value }))}
                                  placeholder="https://account.blob.core.windows.net/container"
                                  className={inputClassName}
                                />
                              </Field>
                              <Field label="SAS Token">
                                <PasswordInput
                                  value={spaceCredentials.azureSasToken}
                                  onChange={(v) => setSpaceCredentials((p) => ({ ...p, azureSasToken: v }))}
                                  placeholder="SAS Token Azure"
                                />
                              </Field>
                            </>
                          )}

                          {spaceImageMode === 's3' && (
                            <>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Région">
                                  <input
                                    value={spaceCredentials.s3Region ?? ''}
                                    onChange={(e) => setSpaceCredentials((p) => ({ ...p, s3Region: e.target.value }))}
                                    placeholder="eu-west-1"
                                    className={inputClassName}
                                  />
                                </Field>
                                <Field label="Bucket">
                                  <input
                                    value={spaceCredentials.s3Bucket ?? ''}
                                    onChange={(e) => setSpaceCredentials((p) => ({ ...p, s3Bucket: e.target.value }))}
                                    placeholder="mon-bucket"
                                    className={inputClassName}
                                  />
                                </Field>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Access Key ID">
                                  <PasswordInput value={spaceCredentials.s3AccessKeyId} onChange={(v) => setSpaceCredentials((p) => ({ ...p, s3AccessKeyId: v }))} placeholder="AKIA…" />
                                </Field>
                                <Field label="Secret Access Key">
                                  <PasswordInput value={spaceCredentials.s3SecretAccessKey} onChange={(v) => setSpaceCredentials((p) => ({ ...p, s3SecretAccessKey: v }))} placeholder="••••••••" />
                                </Field>
                              </div>
                              <Field label="Endpoint custom (optionnel)">
                                <input
                                  value={spaceCredentials.s3Endpoint ?? ''}
                                  onChange={(e) => setSpaceCredentials((p) => ({ ...p, s3Endpoint: e.target.value }))}
                                  placeholder="https://s3.fr-par.scw.cloud"
                                  className={inputClassName}
                                />
                              </Field>
                              <Field label="URL publique de base (optionnel)">
                                <input
                                  value={spaceCredentials.s3PublicBaseUrl ?? ''}
                                  onChange={(e) => setSpaceCredentials((p) => ({ ...p, s3PublicBaseUrl: e.target.value }))}
                                  placeholder="https://cdn.example.com"
                                  className={inputClassName}
                                />
                              </Field>
                            </>
                          )}

                          {spaceImageMode === 'dropbox' && (
                            <>
                              <Field label="Access Token">
                                <PasswordInput value={spaceCredentials.dropboxAccessToken} onChange={(v) => setSpaceCredentials((p) => ({ ...p, dropboxAccessToken: v }))} placeholder="Access Token Dropbox" />
                              </Field>
                              <Field label="Dossier (optionnel)">
                                <input
                                  value={spaceCredentials.dropboxFolderPath ?? ''}
                                  onChange={(e) => setSpaceCredentials((p) => ({ ...p, dropboxFolderPath: e.target.value }))}
                                  placeholder="/images"
                                  className={inputClassName}
                                />
                              </Field>
                            </>
                          )}

                          {spaceImageMode === 'gdrive' && (
                            <>
                              <Field label="Access Token">
                                <PasswordInput value={spaceCredentials.gdriveAccessToken} onChange={(v) => setSpaceCredentials((p) => ({ ...p, gdriveAccessToken: v }))} placeholder="Access Token Google Drive" />
                              </Field>
                              <Field label="ID du dossier (optionnel)">
                                <input
                                  value={spaceCredentials.gdriveFolderId ?? ''}
                                  onChange={(e) => setSpaceCredentials((p) => ({ ...p, gdriveFolderId: e.target.value }))}
                                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                                  className={inputClassName}
                                />
                              </Field>
                            </>
                          )}
                        </div>
                      )}

                      <button
                        disabled={spaceConfigSaving || spaceConfigLoading || !selectedSpace}
                        onClick={async () => {
                          if (!onSaveSpaceConfig || !selectedSpace) return
                          setSpaceConfigSaving(true)
                          try { await onSaveSpaceConfig(selectedSpace, spaceImageMode, spaceCredentials) } finally { setSpaceConfigSaving(false) }
                        }}
                        className="flex items-center gap-2 rounded-holo-lg bg-holo-primary px-4 py-2 text-sm font-medium text-white shadow-holo-glow transition hover:bg-holo-primary/90 disabled:opacity-50"
                      >
                        {spaceConfigSaving ? 'Enregistrement…' : 'Enregistrer pour cet espace'}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-holo-text-faint">Aucun espace connu. Ouvrez d’abord un dossier.</p>
                  )}
                </Section>
              </div>
            )}

            {activeTab === 'ai' && (
              <Section
                title="Intelligence artificielle"
                description="Configure le provider IA utilisé pour les suggestions, résumés et réécritures."
                icon={<Bot size={16} />}
              >
                <Field label="Provider IA">
                  <Select
                    value={draft.aiProvider}
                    onChange={(next) => update({ aiProvider: next as HoloSettingsValue['aiProvider'] })}
                    options={[
                      { value: 'gemini', label: 'Gemini' },
                      { value: 'openai', label: 'OpenAI' },
                      { value: 'local', label: 'Local / désactivé' },
                    ]}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Clé API Gemini">
                    <PasswordInput value={draft.geminiApiKey} onChange={(next) => update({ geminiApiKey: next })} />
                  </Field>

                  <Field label="Clé API OpenAI">
                    <PasswordInput value={draft.openAiApiKey} onChange={(next) => update({ openAiApiKey: next })} />
                  </Field>
                </div>

                <Field label="Prompt système" description="Instruction principale envoyée au modèle.">
                  <textarea
                    value={draft.systemPrompt ?? ''}
                    onChange={(event) => update({ systemPrompt: event.target.value })}
                    rows={5}
                    placeholder="Tu es un assistant..."
                    className={cn(inputClassName, 'resize-none leading-6')}
                  />
                </Field>
              </Section>
            )}

            {activeTab === 'appearance' && (
              <Section title="Apparence" description="Personnalise le rendu de Holo." icon={<Palette size={16} />}>
                <Field label="Thème">
                  <div className="flex flex-wrap gap-2">
                    {(['dark', 'light', 'system'] as const).map((theme) => (
                      <Pill key={theme} active={draft.theme === theme} onClick={() => update({ theme })}>
                        {theme === 'dark' && 'Dark'}
                        {theme === 'light' && 'Light'}
                        {theme === 'system' && 'Système'}
                      </Pill>
                    ))}
                  </div>
                </Field>

                <Field label="Couleur d’accent">
                  <div className="flex flex-wrap gap-2">
                    {(['violet', 'blue', 'cyan'] as const).map((accent) => (
                      <Pill key={accent} active={draft.accent === accent} onClick={() => update({ accent })}>
                        <span
                          className={cn(
                            'size-2.5 rounded-full',
                            accent === 'violet' && 'bg-holo-primary',
                            accent === 'blue' && 'bg-blue-400',
                            accent === 'cyan' && 'bg-cyan-400',
                          )}
                        />
                        {accent}
                      </Pill>
                    ))}
                  </div>
                </Field>
              </Section>
            )}

            {activeTab === 'about' && (
              <Section title="Application" description="Informations sur la version courante." icon={<Sparkles size={16} />}>
                <div className="rounded-holo-xl border border-holo-border-soft bg-holo-glass p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-holo-text">Holo</p>
                      <p className="mt-1 text-xs text-holo-text-faint">v0.1.0-alpha</p>
                    </div>

                    <span className="rounded-full bg-holo-primary-surface px-3 py-1 text-xs text-holo-primary-soft">
                      Alpha
                    </span>
                  </div>
                </div>

                <div className="rounded-holo-xl border border-holo-border-soft bg-holo-glass p-4">
                  <p className="text-sm font-medium text-holo-text">Changelog</p>
                  <div className="mt-3 space-y-4 text-sm text-holo-text-muted">
                    {CHANGELOG_ENTRIES.map((entry) => (
                      <div key={entry.version}>
                        <div className="flex items-center justify-between rounded-holo-md bg-white/[0.025] px-3 py-2">
                          <span className="font-medium">v{entry.version}</span>
                          <span className="text-xs text-holo-text-faint">{entry.releasedAt}</span>
                        </div>
                        <ul className="mt-1.5 space-y-1 pl-3">
                          {entry.items.map((item, i) => (
                            <li key={i} className="flex gap-2 text-xs text-holo-text-faint">
                              <span className="mt-0.5 shrink-0 text-holo-primary-soft">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}
          </main>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-holo-border-soft bg-white/[0.018] px-5 py-4 md:px-6">
            <div className="min-w-0">
              {confirmReset ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-holo-text-muted">Réinitialiser tous les paramètres ?</span>
                  <button
                    onClick={() => {
                      setDraft({ ...defaultValue })
                      onChange?.({ ...defaultValue })
                      onSave?.({ ...defaultValue })
                      setConfirmReset(false)
                    }}
                    className="rounded-holo-md bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/30 active:scale-[0.98]"
                  >Confirmer</button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="rounded-holo-md px-3 py-1 text-xs text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
                  >Annuler</button>
                </div>
              ) : saved ? (
                <p className="truncate text-sm text-holo-success">✓ Configuration sauvegardée</p>
              ) : (
                <p className="truncate text-sm text-holo-text-faint">Les changements sont enregistrés dans .holo.json.</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 rounded-holo-md px-3 py-2 text-sm text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400 active:scale-[0.98]"
                title="Réinitialiser les paramètres par défaut"
              >
                <RotateCcw size={13} />
                Réinitialiser
              </button>
              <button
                onClick={onClose}
                className="rounded-holo-md px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
              >
                Fermer
              </button>

              <button
                onClick={() => onSave?.(draft)}
                className="inline-flex items-center gap-2 rounded-holo-md bg-holo-primary px-4 py-2 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition hover:bg-holo-primary/90 active:scale-[0.98]"
              >
                <Save size={15} />
                Enregistrer
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  )
}
