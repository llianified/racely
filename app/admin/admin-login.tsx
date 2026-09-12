"use client";

import { useState, type FormEvent } from "react";
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
      <div className="adm-login">
        <h1>Panel admin belum aktif</h1>
        <div className="adm-error">
          <p>
            Set <code>RACELY_ADMIN_PASSWORD</code> (minimal 16 karakter) di env
            file lalu jalankan ulang prosesnya.
          </p>
          <p className="adm-note">
            Di produksi env file hidup di <code>/etc/racely/racely.env</code>;
            untuk lokal pakai <code>.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="adm-login" onSubmit={submit}>
      <div>
        <h1>Panel admin Racely</h1>
        <p className="adm-note">
          Antrean penarikan dan config ekonomi. Bukan halaman pemain.
        </p>
      </div>
      <div className="adm-field">
        <label htmlFor="admin-password">Password operator</label>
        <input
          id="admin-password"
          className="adm-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy || !password}>
        {busy ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
