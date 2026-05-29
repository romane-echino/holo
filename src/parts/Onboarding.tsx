import { useState } from 'react'
import { ArrowRight, Mail, Sparkles, UserRound } from 'lucide-react'
import { cn } from '../utils/global'

export type OnboardingWelcomeValue = {
  firstName: string
  lastName: string
  email: string
}

export type OnboardingWelcomeFrameProps = {
  value?: Partial<OnboardingWelcomeValue>
  onChange?: (value: OnboardingWelcomeValue) => void
  onSubmit?: (value: OnboardingWelcomeValue) => void
  onSkip?: () => void
}

const inputClassName =
  'w-full rounded-holo-xl border border-holo-border-soft bg-holo-glass px-4 py-3 text-sm text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-primary/40 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none'

function Field({
  label,
  icon,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string
  icon: React.ReactNode
  value: string
  placeholder: string
  type?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-holo-text-muted">{label}</span>

      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 text-holo-text-faint">
          {icon}
        </span>

        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn(inputClassName, 'pl-11')}
        />
      </div>
    </label>
  )
}

export function Onboarding({
  value,
  onChange,
  onSubmit,
  onSkip,
}: OnboardingWelcomeFrameProps) {
  const [firstName, setFirstName] = useState(value?.firstName ?? '')
  const [lastName, setLastName] = useState(value?.lastName ?? '')
  const [email, setEmail] = useState(value?.email ?? '')

  const currentValue: OnboardingWelcomeValue = {
    firstName,
    lastName,
    email,
  }

  const update = (next: Partial<OnboardingWelcomeValue>) => {
    const merged = {
      ...currentValue,
      ...next,
    }

    if (next.firstName !== undefined) setFirstName(next.firstName)
    if (next.lastName !== undefined) setLastName(next.lastName)
    if (next.email !== undefined) setEmail(next.email)

    onChange?.(merged)
  }

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit?.(currentValue)
  }

  return (
    <section className="flex min-h-full items-center justify-center px-5 py-10">
      <div className="relative w-full max-w-[960px] overflow-hidden rounded-[2rem] border border-holo-border-soft bg-holo-glass shadow-[0_28px_90px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(123,97,255,.20),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(88,166,255,.10),transparent_30rem)]" />

        <div className="relative grid min-h-[620px] lg:grid-cols-[1fr_420px]">
          {/* Left visual / positioning */}
          <div className="hidden border-r border-holo-border-soft/80 p-10 lg:flex lg:flex-col">
            <div className="flex items-center gap-3">
              <img src="./app-icon.png" className='size-11' alt="" />

              <div>
                <div className="text-xl font-semibold tracking-tight text-holo-text">holo</div>
                <div className="-mt-0.5 text-xs text-holo-text-faint">Markdown, Git & knowledge</div>
              </div>
            </div>

            <div className="mt-auto max-w-[430px]">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-holo-glass px-3 py-1.5 text-xs text-holo-primary-soft">
                <Sparkles size={13} />
                Bienvenue dans ton espace de connaissance
              </div>

              <h1 className="text-[3.8rem] font-[680] leading-[0.95] tracking-[-0.065em] text-holo-text">
                Écris comme dans un document. Garde la puissance de Git.
              </h1>

              <p className="mt-6 text-[1.02rem] leading-8 text-holo-text-muted">
                Holo organise tes notes Markdown, synchronise tes changements et prépare ton contenu pour la recherche,
                le wiki interne et le RAG.
              </p>

              <div className="mt-8 grid grid-cols-3 gap-3">
                {[
                  ['MD', 'WYSIWYG'],
                  ['Git', 'Auto-save'],
                  ['AI', 'Ready'],
                ].map(([title, subtitle]) => (
                  <div key={title} className="rounded-holo-2xl border border-holo-border-soft bg-white/[0.025] p-4">
                    <div className="text-sm font-semibold text-holo-text">{title}</div>
                    <div className="mt-1 text-xs text-holo-text-faint">{subtitle}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col p-6 sm:p-8 lg:p-10">
            <div className="lg:hidden">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-holo-xl bg-holo-primary text-white shadow-holo-glow">
                  <span className="text-lg font-bold">h</span>
                </div>

                <div>
                  <div className="text-xl font-semibold tracking-tight text-holo-text">holo</div>
                  <div className="-mt-0.5 text-xs text-holo-text-faint">Markdown, Git & knowledge</div>
                </div>
              </div>
            </div>

            <div className="mb-10">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-holo-primary-surface px-3 py-1.5 text-xs text-holo-primary-soft">
                <Sparkles size={13} />
                Première configuration
              </div>

              <h2 className="text-[clamp(2.2rem,7vw,3.4rem)] font-[680] leading-[0.96] tracking-[-0.06em] text-holo-text">
                Bienvenue dans Holo.
              </h2>

              <p className="mt-4 text-sm leading-7 text-holo-text-muted">
                On prépare ton profil pour personnaliser l’interface, les commits et les documents.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Prénom"
                  icon={<UserRound size={15} />}
                  value={firstName}
                  placeholder="Maria"
                  onChange={(next) => update({ firstName: next })}
                />

                <Field
                  label="Nom"
                  icon={<UserRound size={15} />}
                  value={lastName}
                  placeholder="Bernasconi"
                  onChange={(next) => update({ lastName: next })}
                />
              </div>

              <Field
                label="Email"
                icon={<Mail size={15} />}
                value={email}
                placeholder="maria@example.com"
                type="email"
                onChange={(next) => update({ email: next })}
              />
            </div>

            <div className="mt-6 rounded-holo-2xl border border-holo-border-soft bg-white/[0.018] p-4">
              <p className="text-sm font-medium text-holo-text">Ce profil reste local.</p>
              <p className="mt-1 text-xs leading-6 text-holo-text-faint">
                Tu pourras modifier ces informations plus tard dans les paramètres. Elles peuvent servir pour les
                métadonnées, l’auteur des documents et les snapshots Git.
              </p>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 pt-10">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-holo-md px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
              >
                Plus tard
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-holo-md bg-holo-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition hover:bg-holo-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Continuer
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
