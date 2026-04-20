import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { clearAdminSession, hasValidAdminSession } from "../lib/adminAuth";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const ok = await hasValidAdminSession();
    if (!ok) throw redirect({ to: "/admin/login" });
  },
  component: AdminRoutePage,
});

function AdminRoutePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto mb-4 flex w-full max-w-4xl justify-end">
        <button
          onClick={() => {
            clearAdminSession();
            window.location.href = "/admin/login";
          }}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Sign Out
        </button>
      </div>
      <AdminDashboard />
    </main>
  );
}
