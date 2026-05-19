export function App2() {
  return(


<div className="min-h-screen overflow-hidden text-text">
  <main className="grid h-screen grid-cols-[230px_270px_minmax(0,1fr)_300px] grid-rows-[56px_minmax(0,1fr)_64px]">


    <header className="col-span-4 row-start-1 flex items-center justify-between border-b border-border-soft px-5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white shadow-glow">
          <span className="text-lg font-bold">h</span>
        </div>
        <div>
          <div className="text-xl font-semibold tracking-tight">holo</div>
          <div className="-mt-1 text-[11px] text-text-faint">v2.0</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-text-muted">
        <button className="rounded-xl bg-glass px-3 py-1.5 hover:bg-glass-hover">Share</button>
        <button className="rounded-xl bg-glass px-3 py-1.5 hover:bg-glass-hover">Aa</button>
        <button className="rounded-xl bg-glass px-3 py-1.5 hover:bg-glass-hover">•••</button>
      </div>
    </header>


    <aside className="row-span-2 row-start-2 border-r border-border-soft p-4">
      <nav className="flex h-full flex-col">
        <div className="mb-5 rounded-xl bg-glass px-3 py-2 text-sm text-text-faint">⌘ Search...</div>

        <div className="space-y-1">
          <a className="nav-item nav-item-active" href="#">◷ Recent</a>
          <a className="nav-item" href="#">☆ Favorites</a>
          <a className="nav-item" href="#">◎ Timeline</a>
          <a className="nav-item" href="#">✦ AI Assistant</a>
        </div>

        <div className="mt-7 mb-2 px-3 text-[11px] uppercase tracking-wider text-text-faint">Spaces</div>
        <div className="space-y-1">
          <a className="nav-item nav-item-active" href="#">▣ Architecture</a>
          <a className="nav-item" href="#">▣ Research</a>
          <a className="nav-item" href="#">▣ Product</a>
          <a className="nav-item" href="#">▣ Engineering</a>
          <a className="nav-item" href="#">▣ Meetings</a>
        </div>

        <div className="mt-7 mb-2 px-3 text-[11px] uppercase tracking-wider text-text-faint">Git</div>
        <div className="space-y-1">
          <a className="nav-item" href="#">⑂ Branches <span className="ml-auto rounded-full bg-glass px-2 text-xs">3</span></a>
          <a className="nav-item" href="#">⑂ Pull requests</a>
        </div>

        <div className="mt-auto flex items-center gap-3 border-t border-border-soft pt-4">
          <div className="size-9 rounded-full bg-gradient-to-br from-primary to-primary-soft"></div>
          <div>
            <div className="text-sm font-medium">Stéphane</div>
            <div className="text-xs text-text-faint">Pro</div>
          </div>
        </div>
      </nav>
    </aside>


    <section className="row-start-2 border-r border-border-soft p-4">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-medium">Architecture</h2>
        <button className="rounded-lg px-2 py-1 text-text-muted hover:bg-glass-hover">＋</button>
      </div>

      <div className="mb-2 text-[11px] uppercase tracking-wider text-text-faint">Pinned</div>
      <div className="space-y-1">
        <button className="w-full rounded-xl bg-primary-surface px-3 py-2 text-left text-sm text-primary-soft">▧ System architecture</button>
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-glass-hover">▧ API Gateway</button>
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-glass-hover">▧ Deployment strategy</button>
      </div>

      <div className="mt-7 mb-2 text-[11px] uppercase tracking-wider text-text-faint">Recent</div>
      <div className="space-y-1">
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-glass-hover">▧ Auth flow</button>
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-glass-hover">▧ Data model</button>
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-glass-hover">▧ Security overview</button>
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-glass-hover">▧ Roadmap Q2</button>
      </div>
    </section>


    <section className="row-start-2 overflow-y-auto">
      <div className="mx-auto max-w-[780px] px-10 py-9 font-editor">
        <div className="mb-6 flex items-center gap-3 text-sm text-text-muted">
          <span>▧ Stéphane</span>
          <span>·</span>
          <span>May 30, 2024</span>
          <span>·</span>
          <span className="text-success">● Synced</span>
        </div>

        <article className="editor">
          <h1>System architecture</h1>

          <p>
            This document describes the high-level architecture of the
            <a className="text-primary-soft" href="#">Echino</a> platform and how the different components interact.
          </p>

          <div className="glass my-8 rounded-2xl p-8">
            <div className="grid grid-cols-3 gap-6 text-sm">
              <div className="rounded-xl border border-border-soft p-4">
                <div className="font-medium text-text">Web App</div>
                <div className="text-xs text-text-faint">Next.js</div>
              </div>
              <div className="row-span-2 flex items-center justify-center">
                <div className="rounded-xl border border-primary bg-primary-surface px-6 py-4 text-center shadow-glow">
                  <div className="font-medium">API Gateway</div>
                  <div className="text-xs text-text-faint">Nginx / Envoy</div>
                </div>
              </div>
              <div className="rounded-xl border border-primary p-4">
                <div className="font-medium text-text">Auth Service</div>
                <div className="text-xs text-text-faint">Go</div>
              </div>
              <div className="rounded-xl border border-border-soft p-4">
                <div className="font-medium text-text">Mobile App</div>
                <div className="text-xs text-text-faint">React Native</div>
              </div>
              <div className="rounded-xl border border-warning p-4">
                <div className="font-medium text-text">Core Service</div>
                <div className="text-xs text-text-faint">Rust</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="glass absolute left-1/2 top-[-1.3rem] z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl px-2 py-1.5 text-sm text-text-muted">
              <button className="rounded-lg px-2 py-1 hover:bg-glass-hover">H2</button>
              <button className="rounded-lg px-2 py-1 hover:bg-glass-hover">B</button>
              <button className="rounded-lg px-2 py-1 hover:bg-glass-hover">I</button>
              <button className="rounded-lg px-2 py-1 hover:bg-glass-hover">🔗</button>
              <button className="rounded-lg px-2 py-1 hover:bg-glass-hover">☑</button>
              <button className="rounded-lg bg-primary px-2 py-1 text-white">✦</button>
            </div>
          </div>

          <h2>1. Overview</h2>
          <p>
            Echino is a modular platform built with scalability and security in mind.
            It provides a set of core services and infrastructure components.
          </p>

          <h2>2. Core principles</h2>
          <ul>
            <li>Modular monolith decomposed into domain services.</li>
            <li>Everything is versioned and reproducible.</li>
            <li>Security and privacy by design.</li>
          </ul>

          <div className="mt-10 text-sm text-text-faint">Type “/” for commands or “@” to mention...</div>
        </article>
      </div>
    </section>


    <aside className="row-start-2 border-l border-border-soft p-4">
      <div className="mb-5 flex gap-2">
        <button className="rounded-xl bg-primary-surface px-3 py-2 text-sm text-primary-soft">Outline</button>
        <button className="rounded-xl px-3 py-2 text-sm text-text-muted hover:bg-glass-hover">Links</button>
        <button className="rounded-xl px-3 py-2 text-sm text-text-muted hover:bg-glass-hover">Graph</button>
      </div>

      <ol className="space-y-3 text-sm text-text-muted">
        <li className="rounded-xl bg-glass px-3 py-2 text-text">1. Overview</li>
        <li>2. Core principles</li>
        <li>3. Architecture diagram</li>
        <li>4. Core components</li>
        <li className="pl-4 text-text-faint">4.1 API Gateway</li>
        <li className="pl-4 text-text-faint">4.2 Auth Service</li>
        <li className="pl-4 text-text-faint">4.3 Core Service</li>
      </ol>

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="uppercase tracking-wider text-text-faint">Activity</span>
          <a className="text-primary-soft" href="#">View all</a>
        </div>

        <div className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-medium">Auto-save</div>
            <div className="mt-1 text-xs text-text-faint">System architecture.md · 2m ago</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-medium">AI summary generated</div>
            <div className="mt-1 text-xs text-text-faint">Summary updated · 5m ago</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-medium">Snapshot created</div>
            <div className="mt-1 text-xs text-text-faint">v1.4.2 · 12m ago</div>
          </div>
        </div>
      </div>
    </aside>

    <footer className="col-span-4 row-start-3 flex items-center justify-between border-t border-border-soft px-6 text-sm text-text-muted">
      <div className="flex gap-10">
        <div><span className="text-success">✓</span> Saved <span className="text-text-faint">2m ago</span></div>
        <div><span className="text-primary-soft">☁</span> Synced <span className="text-text-faint">main</span></div>
        <div><span className="text-primary-soft">▧</span> Snapshot <span className="text-text-faint">v1.4.2</span></div>
        <div><span className="text-primary-soft">✦</span> AI ready</div>
      </div>

      <button className="rounded-xl bg-primary px-5 py-2 font-medium text-white shadow-glow hover:bg-primary-soft">
        View history
      </button>
    </footer>
  </main>
</div>

  )
}