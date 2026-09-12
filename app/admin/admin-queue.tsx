"use client";

import { useState } from "react";
import useSWR from "swr";
import { Copy, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/game/panels/info-hint";
import { SectionCardHeading } from "@/components/game/shell/section-card-heading";
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
 * Label pendek untuk panel. `WITHDRAW_STATUS_LABEL` ditulis untuk pemain
 * ("Menunggu diproses", "Dana terkirim"); di dalam badge ia melebar dan
 * memaksa kartu turun baris. Operator sudah punya konteks dari chip saringan.
 */
export const STATUS_SHORT: Record<WithdrawStatus, string> = {
  pending: "Menunggu",
  processing: "Diproses",
  paid: "Terkirim",
  rejected: "Ditolak",
};

const STATUS_VARIANT: Record<
  WithdrawStatus,
  "secondary" | "outline" | "destructive" | "default"
> = {
  pending: "outline",
  processing: "default",
  paid: "secondary",
  rejected: "destructive",
};

const FILTERS: { id: WithdrawStatus | "all"; label: string }[] = [
  ...(Object.keys(STATUS_SHORT) as WithdrawStatus[]).map((id) => ({
    id: id as WithdrawStatus | "all",
    label: STATUS_SHORT[id],
  })),
  { id: "all", label: "Semua" },
];

/**
 * Aksi per status, cerminan ALLOWED_TRANSITIONS di lib/admin-ops.ts. Server
 * tetap yang menegakkannya; yang tidak ada di sini hanya tidak ditawarkan.
 * `paid` dan `rejected` tidak punya aksi: keduanya akhir, karena menolak
 * penarikan yang sudah dibayar akan memulangkan koin yang uangnya sudah
 * keluar (lihat migrasi 0008).
 */
const ACTIONS: Record<
  WithdrawStatus,
  { next: WithdrawStatus; label: string; variant: "gold" | "outline"; confirm: boolean }[]
> = {
  pending: [
    { next: "processing", label: "Proses", variant: "outline", confirm: false },
    { next: "paid", label: "Sudah kirim", variant: "gold", confirm: true },
    { next: "rejected", label: "Tolak", variant: "outline", confirm: true },
  ],
  processing: [
    { next: "paid", label: "Sudah kirim", variant: "gold", confirm: true },
    { next: "rejected", label: "Tolak", variant: "outline", confirm: true },
  ],
  paid: [],
  rejected: [],
};

function confirmText(row: QueueRow, next: WithdrawStatus) {
  if (next === "paid") {
    return `Tandai TERKIRIM: ${rupiah(row.amountIdr)} ke ${row.method.toUpperCase()} ${row.account} (${row.accountName}).\n\nHanya OK kalau transfernya benar-benar sudah dilakukan. Status ini tidak bisa dibatalkan.`;
  }
  return `TOLAK ${rupiah(row.amountIdr)} milik ${row.displayName}?\n\n${decimal(row.coins)} koin kembali ke saldo pemain pada sync berikutnya. Jangan pakai ini untuk penarikan yang sudah dibayar manual.`;
}

export function AdminQueue({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState<WithdrawStatus | "all">("pending");
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    <section className="panel wallet-history-panel" aria-label="Antrean penarikan">
      <SectionCardHeading
        icon={Inbox}
        title="Antrean penarikan"
        aside={
          <>
            <Badge variant="secondary">{count(total)} permintaan</Badge>
            <InfoHint title="Cara kerja antrean">
              Transfer dilakukan di luar Racely, lalu statusnya dicatat di sini.
              Menolak akan mengembalikan koin ke saldo pemain. Status Terkirim
              dan Ditolak tidak bisa diubah lagi.
            </InfoHint>
          </>
        }
      />

      <div className="wallet-chips" role="tablist" aria-label="Saring status">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={cn("wallet-chip", filter === item.id && "is-active")}
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
        <p className="admin-notice" data-tone="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" data-tone="ok">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="wallet-empty">Tidak ada penarikan pada saringan ini.</p>
      ) : (
        <ul className="admin-queue">
          {rows.map((row) => (
            <li key={row.id} className="admin-queue-row">
              <div className="admin-queue-head">
                <div>
                  <h3 className="admin-queue-amount">{rupiah(row.amountIdr)}</h3>
                  <p className="admin-queue-coins">{decimal(row.coins)} koin</p>
                </div>
                <Badge variant={STATUS_VARIANT[row.status]}>
                  {STATUS_SHORT[row.status]}
                </Badge>
              </div>

              <div className="admin-destination">
                <div>
                  <strong>
                    {row.method.toUpperCase()} · {row.account}
                  </strong>
                  <span>{row.accountName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Salin nomor ${row.account}`}
                  onClick={() => void copyAccount(row)}
                >
                  <Copy aria-hidden="true" />
                </Button>
              </div>

              {/*
                Identitas pemain, bukan tujuan transfer -- nama pemegang
                rekening sudah tampil di blok di atas. Dipisah "·" seperti
                baris meta lain di app, bukan spasi.
              */}
              <p className="admin-meta">
                <time dateTime={row.createdAt}>{timestamp(row.createdAt)}</time>
                {" · "}
                {[
                  row.username ? `@${row.username}` : row.displayName,
                  `saldo ${decimal(row.playerBalance)} koin`,
                  `${count(row.playerLaps)} putaran`,
                  row.paidBefore === 0
                    ? "belum pernah dibayar"
                    : `${row.paidBefore}× pernah dibayar`,
                  ...(row.refundedAt ? ["koin sudah dikembalikan"] : []),
                ].join(" · ")}
              </p>

              {ACTIONS[row.status].length > 0 && (
                <div className="admin-row-actions">
                  {ACTIONS[row.status].map((action) => (
                    <Button
                      key={action.next}
                      variant={action.variant}
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() => void act(row, action.next, action.confirm)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > limit && (
        <div className="admin-row-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Sebelumnya
          </Button>
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
