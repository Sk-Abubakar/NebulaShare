import { useState, type FormEvent } from "react";
import { setAdminSession } from "../../lib/adminAuth";

type Props = { onSuccess: () => void };

export function AdminLogin({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const configuredPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    if (!configuredPassword) {
      setError("Admin password is not configured.");
      return;
    }
    if (password === configuredPassword) {
      setSubmitting(true);
      setError("");
      try {
        const ok = await setAdminSession();
        if (!ok) {
          setError("Unable to create admin session.");
          return;
        }
        onSuccess();
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setError("Invalid password");
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
      <h1 className="text-xl font-semibold text-slate-100">Admin Login</h1>
      <p className="mt-2 text-sm text-slate-400">
        Enter the admin password to access dashboard metrics.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-slate-100 outline-none ring-violet-500/40 transition focus:ring-2"
          placeholder="Password"
          autoComplete="current-password"
        />
        {error && <div className="text-sm text-rose-400">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 font-medium text-white shadow-lg transition hover:opacity-95"
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
