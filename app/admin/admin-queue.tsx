"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { WITHDRAW_STATUS_LABEL, type WithdrawStatus } from "@/lib/game";
import type { QueueRow } from "@/lib/admin-ops";
import {
  AdminRequestError,
  adminApi,
  count,
  decimal,
  rupiah,
  timestamp,
} from "./admin-client";

/**
 * Label pendek untuk tabel operasional. `WITHDRAW_STATUS_LABEL` ditulis untuk
 * pemain ("Menunggu diproses", "Dana terkirim") dan di dalam badge tabel ia
 * melebar sampai menyempitkan kolom jumlah dan aksi. Yang dilihat operator
 * sudah punya konteks dari chip saringan di atasnya.
 */
export const STATUS_SHORT: Record<WithdrawStatus, string> = {
  pending: "Menunggu",
  processing: "Diproses",
  paid: "Terkirim",
  rejected: "Ditolak",
};

const FILTERS: { id: WithdrawStatus | "all"; label: string }[] = [
  ...(Object.keys(STATUS_SHORT) as WithdrawStatus[]).map((id) => ({
    id: id as WithdrawStatus | "all",
    label: STATUS_SHORT[id],
  })),
  { id: "all", label: "Semua" },
];

/**
 * Aksi per status. Cerminan ALLOWED_TRANSITIONS di lib/admin-ops.ts -- server
 * tetap yang menegakkannya, tombol yang tidak ada di sini hanya tidak
 * ditawarkan. `paid` dan `rejected` tidak punya aksi: keduanya akhir, karena
 * menolak penarikan yang sudah dibayar akan mengembalikan koin yang uangnya
 * sudah keluar (lihat migrasi 0008).
 */
const ACTIONS: Record<
  WithdrawStatus,
  { next: WithdrawStatus; label: string; confirm: boolean }[]
> = {
  pending: [
    { next: "processing", label: "Proses", confirm: false },
    { next: "paid", label: "Tandai terkirim", confirm: true },
    { next: "rejected", label: "Tolak", confirm: true },
  ],
  processing: [
    { next: "paid", label: "Tandai terkirim", confirm: true },
    { next: "rejected", label: "Tolak", confirm: true },
  ],
  paid: [],
  rejected: [],
};

function confirmText(row: QueueRow, next: WithdrawStatus) {
  if (next === "paid") {
    return `Tandai TERKIRIM: ${rupiah(row.amountIdr)} ke ${row.method.toUpperCase()} ${row.account} (${row.accountName}).\n\nHanya tekan OK kalau transfernya benar-benar sudah dilakukan. Status ini tidak bisa dibatalkan.`;
  }
  return `TOLAK penarikan ${rupiah(row.amountIdr)} milik ${row.displayName}?\n\n${decimal(row.coins)} koin akan dikembalikan ke saldo pemain pada sync berikutnya. Jangan pakai ini untuk penarikan yang sudah dibayar manual.`;
}

export function AdminQueue({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState<WithdrawStatus | "all">("pending");
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // SWR, bukan useEffect + setState: kuncinya ikut saringan dan halaman, jadi
  // mengganti tab akan memuat ulang dengan sendirinya.
  const {
    data: page,
    error: loadError,
    mutate: reload,
  } = useSWR(`admin:queue:${filter}:${offset}`, () =>
    adminApi.queue(filter, offset),
  );
  const error =
    actionError ??
    (loadError
      ? loadError instanceof AdminRequestError
        ? loadError.message
        : "Antrean gagal dimuat."
      : null);

  const act = async (row: QueueRow, next: WithdrawStatus, needsConfirm: boolean) => {
    if (needsConfirm && !window.confirm(confirmText(row, next))) return;
    setBusyId(row.id);
    setActionError(null);
    setNotice(null);
    try {
      await adminApi.transition({
        id: row.id,
        expectedStatus: row.status,
        nextStatus: next,
      });
      setNotice(
        `${rupiah(row.amountIdr)} → ${WITHDRAW_STATUS_LABEL[next].toLowerCase()}.`,
      );
      await reload();
      onChanged();
    } catch (cause) {
      setActionError(
        cause instanceof AdminRequestError
          ? cause.message
          : "Perubahan gagal disimpan.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const copyAccount = async (row: QueueRow) => {
    try {
      await navigator.clipboard.writeText(row.account);
      setNotice(`Nomor ${row.account} disalin.`);
    } catch {
      setActionError("Nomor gagal disalin.");
    }
  };

  const rows = page?.rows ?? [];
  const total = page?.total ?? 0;
  const limit = page?.limit ?? 25;

  return (
    <section className="adm-panel" aria-label="Antrean penarikan">
      <header>
        <div>
          <h2>Antrean penarikan</h2>
          <p>
            Diproses manual. Transfer dilakukan di luar Racely, lalu statusnya
            dicatat di sini.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Muat ulang
        </Button>
      </header>

      <div className="adm-tabs" role="tablist" aria-label="Saring status">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="adm-tab"
            aria-selected={filter === item.id}
            onClick={() => {
              setFilter(item.id);
              setOffset(0);
            }}
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
      {notice && <p className="adm-ok">{notice}</p>}

      {rows.length === 0 ? (
        <p className="adm-note">Tidak ada penarikan pada saringan ini.</p>
      ) : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Diajukan</th>
                <th scope="col">Pemain</th>
                <th scope="col">Tujuan</th>
                <th scope="col">Jumlah</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <time dateTime={row.createdAt}>
                      {timestamp(row.createdAt)}
                    </time>
                    {row.processedAt && (
                      <small>diproses {timestamp(row.processedAt)}</small>
                    )}
                  </td>
                  <td>
                    <strong>{row.displayName}</strong>
                    <small>
                      {row.username ? `@${row.username} · ` : ""}
                      <code>{row.userId}</code>
                    </small>
                    <small>
                      saldo {decimal(row.playerBalance)} koin ·{" "}
                      {count(row.playerLaps)} putaran · {row.paidBefore}× pernah
                      dibayar
                    </small>
                  </td>
                  <td>
                    <strong>{row.method.toUpperCase()}</strong>
                    <small>
                      <code>{row.account}</code>
                    </small>
                    <small>{row.accountName}</small>
                  </td>
                  <td>
                    <strong className="adm-amount">{rupiah(row.amountIdr)}</strong>
                    <small className="adm-amount">{decimal(row.coins)} koin</small>
                  </td>
                  <td>
                    <span className="adm-status" data-status={row.status}>
                      {STATUS_SHORT[row.status]}
                    </span>
                    {row.refundedAt && (
                      <small>koin dikembalikan {timestamp(row.refundedAt)}</small>
                    )}
                  </td>
                  <td>
                    <div className="adm-row-actions">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => void copyAccount(row)}
                      >
                        Salin no.
                      </Button>
                      {ACTIONS[row.status].map((action) => (
                        <Button
                          key={action.next}
                          variant={action.next === "rejected" ? "outline" : "default"}
                          size="xs"
                          disabled={busyId === row.id}
                          onClick={() => void act(row, action.next, action.confirm)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="adm-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Sebelumnya
          </Button>
          <span className="adm-note">
            {offset + 1}–{Math.min(offset + limit, total)} dari {count(total)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Berikutnya
          </Button>
        </div>
      )}
    </section>
  );
}
