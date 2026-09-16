"use client";

import type {
  AuditRow,
  LiabilitySnapshot,
  PlayerBalancePage,
  PlayerBalanceUpdate,
  QueuePage,
} from "@/lib/admin-ops";
import type { EconomyConfig } from "@/lib/economy-config";
import type { EconomyProjection } from "@/lib/economy-projection";
import type { WithdrawStatus } from "@/lib/game";

/**
 * Pembungkus fetch untuk seluruh endpoint `/api/admin`. Panel ini sengaja
 * dijalankan di client: satu-satunya batas keamanannya adalah cookie sesi yang
 * diperiksa di route, jadi tidak ada dua jalur autentikasi yang bisa menyimpang.
 * Halaman kosong yang terkirim ke browser tidak membawa rahasia apa pun.
 */
export type Overview = {
  economy: EconomyConfig;
  liability: LiabilitySnapshot;
  audit: AuditRow[];
  projection: EconomyProjection;
};

export type EconomySnapshot = {
  config: EconomyConfig;
  defaults: EconomyConfig;
  updatedAt: string | null;
  updatedBy: string | null;
  usingDefaults: boolean;
};

export class AdminRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues: string[] = [],
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init?.headers }
      : init?.headers,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload as { error?: string; issues?: string[] } | null;
    throw new AdminRequestError(
      body?.error ?? "Permintaan gagal.",
      response.status,
      body?.issues ?? [],
    );
  }
  return payload as T;
}

export const adminApi = {
  session: () =>
    call<{ configured: boolean; authenticated: boolean }>("/api/admin/session"),
  login: (password: string) =>
    call<{ authenticated: true }>("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () =>
    call<{ authenticated: false }>("/api/admin/session", { method: "DELETE" }),
  overview: () => call<Overview>("/api/admin/overview"),
  queue: (status: WithdrawStatus | "all", offset = 0) =>
    call<QueuePage>(
      `/api/admin/withdrawals?status=${status}&offset=${offset}&limit=25`,
    ),
  transition: (body: {
    id: string;
    expectedStatus: WithdrawStatus;
    nextStatus: WithdrawStatus;
  }) =>
    call<{ id: string }>("/api/admin/withdrawals", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  players: (query = "", offset = 0) =>
    call<PlayerBalancePage>(
      `/api/admin/players?q=${encodeURIComponent(query)}&offset=${offset}&limit=25`,
    ),
  updatePlayerBalance: (body: {
    userId: string;
    expectedBalance: number;
    balance: number;
  }) =>
    call<PlayerBalanceUpdate>("/api/admin/players", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  economy: () => call<EconomySnapshot>("/api/admin/economy"),
  saveEconomy: (config: EconomyConfig) =>
    call<{ config: EconomyConfig; changed: Record<string, unknown> }>(
      "/api/admin/economy",
      { method: "PUT", body: JSON.stringify(config) },
    ),
  devSeed: () =>
    call<{ userId: string; withdrawalId: string; coins: number }>(
      "/api/admin/dev-seed",
      { method: "POST", body: JSON.stringify({}) },
    ),
};

const idrFormat = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

/** Rupiah mentah (bukan koin). `idr()` di lib/game mengubah koin jadi rupiah. */
export const rupiah = (value: number) =>
  Number.isFinite(value) ? `Rp${idrFormat.format(Math.round(value))}` : "—";

export const count = (value: number) =>
  Number.isFinite(value) ? idrFormat.format(Math.round(value)) : "—";

export const decimal = (value: number, digits = 2) =>
  Number.isFinite(value)
    ? value.toLocaleString("id-ID", {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      })
    : "—";

export const timestamp = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
