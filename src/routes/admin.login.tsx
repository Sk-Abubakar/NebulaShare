import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AdminLogin } from "../components/admin/AdminLogin";
import { hasValidAdminSession } from "../lib/adminAuth";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
  beforeLoad: async () => {
    const ok = await hasValidAdminSession();
    if (ok) {
      throw redirect({ to: "/admin" });
    }
  },
});

function AdminLoginPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10">
      <AdminLogin
        onSuccess={() => {
          navigate({ to: "/admin" });
        }}
      />
    </main>
  );
}
