"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminRequestError, adminApi } from "./admin-client";

export function AdminLogin({
  configured,
  onSignedIn,
}: {
  configured: boolean;
  onSignedIn: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(password);
      setPassword("");
      onSignedIn();
    } catch (cause) {
      setError(
        cause instanceof AdminRequestError
          ? cause.message
          : "Tidak bisa masuk. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <main className="admin-login">
        <div className="admin-login-intro">
          <span className="eyebrow">Panel admin</span>
          <h1>Belum aktif.</h1>
          <p>
            Set <code>RACELY_ADMIN_PASSWORD</code> minimal 16 karakter, lalu
            jalankan ulang prosesnya.
          </p>
        </div>
        <p className="admin-notice" data-tone="error">
          Di produksi env file ada di <code>/etc/racely/racely.env</code>; untuk
          lokal pakai <code>.env.local</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="admin-login">
      <div className="admin-login-intro">
        <span className="eyebrow">Panel admin</span>
        <h1>Racely operasional.</h1>
        <p>Antrean penarikan dan config ekonomi. Bukan halaman pemain.</p>
      </div>
      <form className="panel wallet-form-panel" onSubmit={submit}>
        <div className="wallet-form">
          <div className="wallet-field">
            <label htmlFor="admin-password">Password operator</label>
            <input
              id="admin-password"
              className="wallet-input"
              type="password"
              autoComplete="current-password"
              inputMode="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p className="admin-notice" data-tone="error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            disabled={busy || !password}
          >
            <ShieldCheck data-icon="inline-start" />
            {busy ? "Memeriksa…" : "Masuk"}
          </Button>
        </div>
      </form>
    </main>
  );
}
