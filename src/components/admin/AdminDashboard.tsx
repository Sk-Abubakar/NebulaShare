import { useSessionMetrics } from "../../contexts/SessionMetricsContext";

export function AdminDashboard() {
  const { filesShared, dataTransferredMb, activeConnections, resetMetrics } = useSessionMetrics();

  const cards = [
    { label: "Files Shared", value: filesShared.toString() },
    { label: "Data Transferred", value: `${dataTransferredMb} MB` },
    { label: "Active Connections", value: activeConnections.toString() },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Admin Dashboard</h2>
        <button
          onClick={resetMetrics}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Reset Metrics
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
