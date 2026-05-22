import { cn } from "../utils/global";

export type HoloActivity = {
  title: string;
  subtitle?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
};


type HoloInspectorProps = {
  outline?: string[];
  activities?: HoloActivity[];
};

function ActivityCard({ activity }: { activity: HoloActivity }) {
  const dot =
    activity.tone === "success" ? "bg-holo-success" :
    activity.tone === "warning" ? "bg-holo-warning" :
    activity.tone === "danger" ? "bg-holo-danger" :
    activity.tone === "primary" ? "bg-holo-primary" :
    "bg-holo-text-faint";

  return (
    <div className="holo-glass rounded-holo-xl p-4">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", dot)} />
        <div className="text-sm font-medium">{activity.title}</div>
      </div>
      {activity.subtitle && <div className="mt-1 text-xs text-holo-text-faint">{activity.subtitle}</div>}
    </div>
  );
}

export function Inspector({
  outline = ["1. Overview", "2. Core principles", "3. Architecture diagram", "4. Core components", "4.1 API Gateway", "4.2 Auth Service"],
  activities = [
    { title: "Auto-save", subtitle: "System architecture.md · 2m ago", tone: "success" },
    { title: "AI summary generated", subtitle: "Summary updated · 5m ago", tone: "primary" },
    { title: "Snapshot created", subtitle: "v1.4.2 · 12m ago" },
  ],
}: HoloInspectorProps) {
  return (
    <aside className="h-full p-4">
      <div className="mb-5 flex gap-2">
        <button className="rounded-holo-md bg-holo-primary-surface px-3 py-2 text-sm text-holo-primary-soft">
            Table des matières
        </button>
        <button className="rounded-holo-md px-3 py-2 text-sm text-holo-text-muted hover:bg-holo-glass-hover">
            Liens
        </button>
      </div>

      <ol className="space-y-3 text-sm text-holo-text-muted">
        {outline.map((item, index) => (
          <li
            key={item}
            className={cn(
              index === 0 && "rounded-holo-md bg-holo-glass px-3 py-2 text-holo-text",
              item.includes(".1") || item.includes(".2") ? "pl-4 text-holo-text-faint" : undefined
            )}
          >
            {item}
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-[11px] uppercase tracking-wider text-holo-text-faint">Activités</span>
          <button className="text-holo-primary-soft">Voir tout</button>
        </div>

        <div className="space-y-3">
          {activities.map((activity) => <ActivityCard key={activity.title} activity={activity} />)}
        </div>
      </div>
    </aside>
  );
}
