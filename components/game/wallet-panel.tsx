"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Clock, Coins, Send, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "./info-hint";
import { cn } from "@/lib/utils";
import {
  accountPattern,
  coins,
  formatCoins,
  idr,
  methodLabel,
  MIN_WITHDRAW_COINS,
  WITHDRAW_METHODS,
  WITHDRAW_STATUS_LABEL,
  type GameState,
  type WithdrawMethod,
} from "@/lib/game";

export type WithdrawPayload = {
  method: WithdrawMethod;
  account: string;
  accountName: string;
  coins: number;
};

const QUICK_AMOUNTS = [100, 250, 500, 1000];

export function WalletPanel({
  game,
  onWithdraw,
  disabled = false,
}: {
  game: GameState;
  onWithdraw: (payload: WithdrawPayload) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [method, setMethod] = useState<WithdrawMethod>("dana");
  const [amount, setAmount] = useState(String(MIN_WITHDRAW_COINS));
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const balance = Math.floor(game.balance);
  const requested = Number.parseInt(amount, 10) || 0;
  const isBank =
    WITHDRAW_METHODS.find((item) => item.id === method)?.kind === "bank";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    if (!Number.isInteger(requested) || requested < MIN_WITHDRAW_COINS) {
      setError(`Penarikan minimal ${coins(MIN_WITHDRAW_COINS)}.`);
      return;
    }
    if (requested > balance) {
      setError("Saldo koin kamu belum cukup untuk nominal ini.");
      return;
    }
    if (!accountPattern(method).test(account.trim())) {
      setError(
        isBank
          ? "Nomor rekening harus 8-18 digit angka."
          : "Nomor e-wallet harus diawali 08 dan 10-14 digit.",
      );
      return;
    }
    if (accountName.trim().length < 2) {
      setError("Isi nama pemilik rekening sesuai buku tabungan.");
      return;
    }
    setError(null);
    const ok = await onWithdraw({
      method,
      account: account.trim(),
      accountName: accountName.trim(),
      coins: requested,
    });
    if (ok) {
      setAmount(String(MIN_WITHDRAW_COINS));
      setAccount("");
      setAccountName("");
    }
  };

  return (
    <div className="section-enter flex flex-col gap-2.5">
      <section className="wallet-hero" aria-label="Saldo koin">
        <div>
          <span className="eyebrow">Saldo koin</span>
          <strong>{formatCoins(balance)}</strong>
          <p>
            Setara {idr(balance)} · 1 koin = {idr(1)}
          </p>
        </div>
        <div className="wallet-hero-side">
          <span className="wallet-pending">
            <Coins aria-hidden="true" />
            {coins(game.pending)} belum diklaim
          </span>
          <InfoHint title="Cara kerja saldo">
            Koin dari balapan masuk ke &quot;belum diklaim&quot; dulu. Setiap 1
            koin penuh bisa kamu klaim ke saldo, lalu ditarik ke e-wallet atau
            rekening bank saat mencapai {coins(MIN_WITHDRAW_COINS)}.
          </InfoHint>
        </div>
      </section>

      <section className="panel wallet-form-panel" aria-label="Tarik koin">
        <div className="section-card-heading">
          <h2>
            <Send aria-hidden="true" />
            Tarik saldo
          </h2>
          <span>Min. {coins(MIN_WITHDRAW_COINS)}</span>
        </div>
        <form className="wallet-form" onSubmit={submit}>
          <div className="wallet-field">
            <label htmlFor="withdraw-amount">Jumlah koin</label>
            <input
              id="withdraw-amount"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, "").slice(0, 7))
              }
              className="wallet-input"
              aria-describedby="withdraw-amount-note"
            />
            <p id="withdraw-amount-note">
              Kamu terima {idr(requested)} setelah diproses.
            </p>
          </div>

          <div className="wallet-chips" role="group" aria-label="Nominal cepat">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "wallet-chip",
                  requested === value && "is-active",
                )}
                disabled={value > balance}
                onClick={() => setAmount(String(value))}
              >
                {formatCoins(value)}
              </button>
            ))}
            <button
              type="button"
              className="wallet-chip"
              disabled={balance < MIN_WITHDRAW_COINS}
              onClick={() => setAmount(String(balance))}
            >
              Semua
            </button>
          </div>

          <div className="wallet-field">
            <span id="withdraw-method-label">Metode</span>
            <div
              className="wallet-methods"
              role="radiogroup"
              aria-labelledby="withdraw-method-label"
            >
              {WITHDRAW_METHODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={method === item.id}
                  className={cn(
                    "wallet-method",
                    method === item.id && "is-active",
                  )}
                  onClick={() => setMethod(item.id)}
                >
                  {item.kind === "bank" ? (
                    <Banknote aria-hidden="true" />
                  ) : (
                    <Wallet aria-hidden="true" />
                  )}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="wallet-field">
            <label htmlFor="withdraw-account">
              {isBank ? "Nomor rekening" : "Nomor e-wallet"}
            </label>
            <input
              id="withdraw-account"
              inputMode="numeric"
              autoComplete="off"
              placeholder={isBank ? "1234567890" : "08123456789"}
              value={account}
              onChange={(event) =>
                setAccount(event.target.value.replace(/\D/g, "").slice(0, 18))
              }
              className="wallet-input"
            />
          </div>

          <div className="wallet-field">
            <label htmlFor="withdraw-name">Nama pemilik</label>
            <input
              id="withdraw-name"
              autoComplete="name"
              placeholder="Nama sesuai rekening"
              value={accountName}
              onChange={(event) =>
                setAccountName(event.target.value.slice(0, 60))
              }
              className="wallet-input"
            />
          </div>

          {error && (
            <p className="wallet-error" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            disabled={disabled || balance < MIN_WITHDRAW_COINS}
          >
            <Send data-icon="inline-start" />
            {balance < MIN_WITHDRAW_COINS
              ? `Kumpulkan ${coins(MIN_WITHDRAW_COINS - balance)} lagi`
              : `Tarik ${idr(requested)}`}
          </Button>
          <p className="wallet-note">
            Penarikan diverifikasi manual oleh tim Racely dalam 1×24 jam kerja.
            Pastikan nomor dan nama tujuan benar; dana yang salah kirim tidak
            bisa ditarik kembali.
          </p>
        </form>
      </section>

      <section className="panel wallet-history-panel" aria-label="Riwayat penarikan">
        <div className="section-card-heading">
          <h2>
            <Clock aria-hidden="true" />
            Riwayat penarikan
          </h2>
          <span>{game.withdrawals.length} permintaan</span>
        </div>
        {game.withdrawals.length === 0 ? (
          <p className="wallet-empty">
            Belum ada penarikan. Riwayat kamu akan muncul di sini.
          </p>
        ) : (
          <ul className="wallet-history">
            {game.withdrawals.map((item) => (
              <li key={item.id} className="wallet-history-row">
                <div>
                  <h3>{idr(item.coins)}</h3>
                  <p>
                    {methodLabel(item.method)} · {item.account} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge variant="secondary">
                  {WITHDRAW_STATUS_LABEL[item.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
