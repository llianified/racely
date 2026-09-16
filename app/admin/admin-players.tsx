"use client";

import { useState, type FormEvent } from "react";
import { Search, Users } from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/game/panels/info-hint";
import { SectionCardHeading } from "@/components/game/shell/section-card-heading";
import type { PlayerBalanceRow } from "@/lib/admin-ops";
import {
  AdminRequestError,
  adminApi,
  count,
  decimal,
} from "./admin-client";

export function AdminPlayers({ onChanged }: { onChanged: () => void }) {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: page,
    error: loadError,
    mutate: reload,
  } = useSWR(`admin:players:${query}:${offset}`, () =>
    adminApi.players(query, offset),
  );
  const error =
    actionError ??
    (loadError
      ? loadError instanceof AdminRequestError
        ? loadError.message
        : "Daftar user gagal dimuat."
      : null);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draftQuery.trim());
    setOffset(0);
    setActionError(null);
    setNotice(null);
  };

  const save = async (row: PlayerBalanceRow) => {
    const raw = drafts[row.userId] ?? String(row.balance);
    const nextBalance = Number(raw);
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
      setActionError("Saldo baru harus bilangan bulat 0 atau lebih.");
      return;
    }
    if (nextBalance === row.balance) return;
    if (
      !window.confirm(
        `Ubah saldo ${row.displayName} dari ${count(row.balance)} menjadi ${count(nextBalance)} koin?`,
      )
    ) {
      return;
    }

    setBusyId(row.userId);
    setActionError(null);
    setNotice(null);
    try {
      await adminApi.updatePlayerBalance({
        userId: row.userId,
        expectedBalance: row.balance,
        balance: nextBalance,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.userId];
        return next;
      });
      setNotice(
        `Saldo ${row.displayName} disimpan: ${count(nextBalance)} koin.`,
      );
      await reload();
      onChanged();
    } catch (cause) {
      setActionError(
        cause instanceof AdminRequestError
          ? cause.message
          : "Saldo gagal disimpan.",
      );
      if (cause instanceof AdminRequestError && cause.status === 409) {
        setDrafts((current) => {
          const next = { ...current };
          delete next[row.userId];
          return next;
        });
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  };

  const rows = page?.rows ?? [];
  const total = page?.total ?? 0;
  const limit = page?.limit ?? 25;

  return (
    <section className="panel wallet-history-panel" aria-label="Saldo user">
      <SectionCardHeading
        icon={Users}
        title="Saldo user"
        aside={
          <>
            <Badge variant="secondary">{count(total)} user</Badge>
            <InfoHint title="Saldo yang diubah">
              Hanya saldo koin yang sudah tersedia. Koin belum diklaim dan total
              pendapatan tidak ikut berubah. Setiap perubahan dicatat di audit.
            </InfoHint>
          </>
        }
      />

      <form className="admin-search" role="search" onSubmit={search}>
        <label className="sr-only" htmlFor="admin-player-search">
          Cari user
        </label>
        <input
          id="admin-player-search"
          className="wallet-input"
          type="search"
          autoComplete="off"
          placeholder="Nama, username, atau Telegram ID"
          value={draftQuery}
          maxLength={80}
          onChange={(event) => setDraftQuery(event.target.value)}
        />
        <Button type="submit" variant="outline" size="icon">
          <Search aria-hidden="true" />
          <span className="sr-only">Cari</span>
        </Button>
      </form>

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
        <p className="wallet-empty">
          {page ? "User tidak ditemukan." : "Memuat user…"}
        </p>
      ) : (
        <ul className="admin-queue">
          {rows.map((row) => {
            const draft = drafts[row.userId] ?? String(row.balance);
            const unchanged = Number(draft) === row.balance;
            return (
              <li key={row.userId} className="admin-queue-row">
                <div className="admin-player-head">
                  <div>
                    <h3>{row.displayName}</h3>
                    <p>
                      {row.username ? `@${row.username}` : "Tanpa username"}
                    </p>
                  </div>
                  <Badge variant="outline">{count(row.laps)} putaran</Badge>
                </div>

                <p className="admin-meta">
                  <span>ID {row.userId}</span>
                  <span>{decimal(row.pending)} koin belum diklaim</span>
                  <span>{decimal(row.earned)} koin diperoleh</span>
                </p>

                <div className="admin-player-balance">
                  <div className="admin-player-value">
                    <span className="eyebrow">Saldo tersedia</span>
                    <strong>{count(row.balance)}</strong>
                    <span>koin</span>
                  </div>
                  <form
                    className="admin-balance-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save(row);
                    }}
                  >
                    <label className="sr-only" htmlFor={`balance-${row.userId}`}>
                      Saldo baru untuk {row.displayName}
                    </label>
                    <input
                      id={`balance-${row.userId}`}
                      className="wallet-input"
                      inputMode="numeric"
                      autoComplete="off"
                      value={draft}
                      disabled={busyId === row.userId}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.userId]: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 16),
                        }))
                      }
                    />
                    <Button
                      type="submit"
                      variant="gold"
                      size="sm"
                      disabled={busyId === row.userId || unchanged || draft === ""}
                    >
                      {busyId === row.userId ? "Menyimpan…" : "Simpan"}
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
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
