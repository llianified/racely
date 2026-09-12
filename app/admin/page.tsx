"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { AdminEconomy } from "./admin-economy";
import { AdminLogin } from "./admin-login";
import { AdminOverview } from "./admin-overview";
import { AdminQueue } from "./admin-queue";
import { AdminRequestError, adminApi } from "./admin-client";

type Tab = "queue" | "economy" | "overview";

const TABS: { id: Tab; label: string }[] = [
  { id: "queue", label: "Antrean" },
  { id: "economy", label: "Ekonomi" },
  { id: "overview", label: "Kewajiban" },
];

/**
 * Panel dijalankan sebagai satu client component. Autentikasinya hanya ada di
 * `/api/admin/*`: HTML yang terkirim ke browser tidak membawa data apa pun, dan
 * setiap isinya diambil lewat endpoint yang memeriksa cookie sesi. Satu batas
 * keamanan, bukan dua yang bisa menyimpang.
 *
 * Pemuatan memakai SWR -- pola yang sama dengan game-dashboard -- supaya tidak
 * ada state yang disetel dari dalam effect, dan sesi yang berakhir di tengah
 * kerja cukup memicu pembacaan ulang, bukan penulisan state secara manual.
 */
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [seeding, setSeeding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: session, mutate: recheckSession } = useSWR(
    "admin:session",
    () => adminApi.session(),
  );

  const authenticated = session?.authenticated ?? false;
  const {
    data,
    error: loadError,
    mutate: reload,
  } = useSWR(
    authenticated ? "admin:data" : null,
    async () => {
      const [overview, economy] = await Promise.all([
        adminApi.overview(),
        adminApi.economy(),
      ]);
      return { overview, economy };
    },
    {
      // Sesi yang berakhir di tengah kerja memicu pembacaan ulang status, yang
      // akan menampilkan form login. Lewat onError, bukan di fase render:
      // memanggil mutate saat render akan menyetel state komponen lain di
      // tengah render komponen ini.
      onError: (cause) => {
        if (cause instanceof AdminRequestError && cause.status === 401) {
          void recheckSession();
        }
      },
    },
  );

  if (!session) return <p className="adm-note">Memuat panel…</p>;

  if (!session.authenticated) {
    return (
      <AdminLogin
        configured={session.configured}
        onSignedIn={() => void recheckSession()}
      />
    );
  }

  const seed = async () => {
    setSeeding(true);
    setActionError(null);
    try {
      await adminApi.devSeed();
      await reload();
      setTab("queue");
    } catch (cause) {
      setActionError(
        cause instanceof AdminRequestError ? cause.message : "Seed gagal dibuat.",
      );
    } finally {
      setSeeding(false);
    }
  };

  const error =
    actionError ??
    (loadError && !(loadError instanceof AdminRequestError && loadError.status === 401)
      ? loadError instanceof AdminRequestError
        ? loadError.message
        : "Data panel gagal dimuat."
      : null);

  return (
    <>
      <div className="adm-top">
        <div>
          <h1>Panel admin Racely</h1>
          <p>
            Penarikan diproses manual. Panel ini mencatat keputusannya, bukan
            mengirim dananya.
          </p>
        </div>
        <div className="adm-top-actions">
          {process.env.NODE_ENV !== "production" && (
            <Button
              variant="outline"
              size="sm"
              disabled={seeding}
              onClick={() => void seed()}
              title="Membuat pemain palsu beserta penarikan pending. Hanya di luar produksi."
            >
              {seeding ? "Membuat…" : "Seed penarikan"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await adminApi.logout().catch(() => undefined);
              await recheckSession();
            }}
          >
            Keluar
          </Button>
        </div>
      </div>

      <div className="adm-tabs" role="tablist" aria-label="Bagian panel">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="adm-tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      {tab === "queue" && <AdminQueue onChanged={() => void reload()} />}
      {tab === "economy" &&
        (data ? (
          <AdminEconomy snapshot={data.economy} onSaved={() => void reload()} />
        ) : (
          <p className="adm-note">Memuat config…</p>
        ))}
      {tab === "overview" &&
        (data ? (
          <AdminOverview overview={data.overview} />
        ) : (
          <p className="adm-note">Memuat ringkasan…</p>
        ))}
    </>
  );
}
