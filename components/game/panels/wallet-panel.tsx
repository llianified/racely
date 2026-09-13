"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Clock, Coins, Send, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InfoHint } from "./info-hint";
import { SectionCardHeading } from "../shell/section-card-heading";
import { cn } from "@/lib/utils";
import {
  accountPattern,
  coins,
  formatCoins,
  idr,
  methodLabel,
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

/**
 * Nominal cepat diturunkan dari batas minimum, bukan ditulis lepas: minimum yang
 * disetel jadi 500 dari panel akan membuat chip "100" menawarkan penarikan yang
 * pasti ditolak server. Pada nilai bawaan hasilnya tetap 100/250/500/1000.
 */
const quickAmounts = (min: number) =>
  [min, min * 2.5, min * 5, min * 10].map((value) => Math.round(value));

export function WalletPanel({
  game,
  onWithdraw,
  disabled = false,
}: {
  game: GameState;
  onWithdraw: (payload: WithdrawPayload) => Promise<boolean>;
  disabled?: boolean;
}) {
  const { economy } = game;
  const minWithdraw = economy.minWithdrawCoins;
  const [method, setMethod] = useState<WithdrawMethod>("dana");
  const [amount, setAmount] = useState(String(minWithdraw));
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const balance = Math.floor(game.balance);
  const requested = Number.parseInt(amount, 10) || 0;
  const isBank =
    WITHDRAW_METHODS.find((item) => item.id === method)?.kind === "bank";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    if (!Number.isInteger(requested) || requested < minWithdraw) {
      setError(`Penarikan minimal ${coins(minWithdraw)}.`);
      return;
    }
    if (requested > economy.maxWithdrawCoins) {
      setError(`Penarikan maksimal ${coins(economy.maxWithdrawCoins)}.`);
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
      setError(isBank ? "Isi nama pemilik rekening sesuai buku tabungan." : "Isi nama pemilik sesuai akun e-wallet.");
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
      setAmount(String(minWithdraw));
      setAccount("");
      setAccountName("");
      setOpen(false);
    }
  };

  return (
    <div className="wallet-layout section-enter flex flex-col gap-lg">
      <section className="wallet-hero" aria-label="Saldo koin">
        <div className="wallet-balance">
          <span className="eyebrow">Saldo tersedia</span>
          <strong>{formatCoins(balance)} <span>koin</span></strong>
          <p>~ {idr(balance, economy)}</p>
        </div>
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          disabled={disabled || balance < minWithdraw}
          onClick={() => setOpen(true)}
        >
          <Send data-icon="inline-start" />
          {balance < minWithdraw
            ? `Kumpulkan ${coins(minWithdraw - balance)} lagi`
            : "Tarik saldo"}
        </Button>
        <div className="wallet-hero-side">
          <span className="wallet-pending">
            <Coins aria-hidden="true" />
            {coins(game.pending)} belum diklaim
          </span>
          <InfoHint title="Cara kerja saldo">
            Koin dari balapan masuk ke &quot;belum diklaim&quot; dulu. Setiap 1
            koin penuh bisa kamu klaim ke saldo, lalu ditarik ke e-wallet atau
            rekening bank saat mencapai {coins(minWithdraw)}.
          </InfoHint>
        </div>
      </section>

      <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
    <SheetContent side="bottom" className="game-sheet wallet-dialog p-md">
      <SheetHeader className="p-0">
            <SheetTitle>
              <Send aria-hidden="true" />
              Tarik saldo
            </SheetTitle>
            <SheetDescription>
              Saldo {formatCoins(balance)} koin · minimal {coins(minWithdraw)} per penarikan.
            </SheetDescription>
          </SheetHeader>
          <p className="wallet-dialog-note">
            Penarikan diverifikasi manual oleh tim Racely dalam 1×24 jam kerja.
            Pastikan nomor dan nama tujuan benar; dana yang salah kirim tidak
            bisa ditarik kembali. Kalau permintaanmu ditolak, koinnya otomatis
            kembali ke saldo.
          </p>
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
              Kamu terima {idr(requested, economy)} setelah diproses.
            </p>
          </div>

          <div className="wallet-chips" role="group" aria-label="Nominal cepat">
            {quickAmounts(minWithdraw).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "wallet-chip",
                  requested === value && "is-active",
                )}
                aria-pressed={requested === value}
                aria-label={`${formatCoins(value)} koin`}
                disabled={value > balance}
                onClick={() => setAmount(String(value))}
              >
                {formatCoins(value)}
              </button>
            ))}
            <button
              type="button"
              className="wallet-chip"
              disabled={balance < minWithdraw}
              onClick={() => setAmount(String(balance))}
            >
              Semua
            </button>
          </div>

          <fieldset className="wallet-method-fieldset">
            <legend>Metode penarikan</legend>
            {(["ewallet", "bank"] as const).map((kind) => (
              <div className="wallet-method-group" key={kind}>
                <p>{kind === "bank" ? "Transfer bank" : "E-wallet"}</p>
                <div className="wallet-methods">
                  {WITHDRAW_METHODS.filter((item) =>
                    kind === "bank" ? item.kind === "bank" : item.kind !== "bank",
                  ).map((item) => (
                    <label key={item.id} className="wallet-method">
                      <input
                        type="radio"
                        name="withdraw-method"
                        value={item.id}
                        checked={method === item.id}
                        onChange={() => setMethod(item.id)}
                        className="sr-only"
                      />
                      {item.kind === "bank" ? (
                        <Banknote aria-hidden="true" />
                      ) : (
                        <Wallet aria-hidden="true" />
                      )}
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

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
              placeholder={isBank ? "Nama sesuai rekening" : "Nama sesuai akun e-wallet"}
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
            disabled={disabled || balance < minWithdraw}
          >
            <Send data-icon="inline-start" />
            {balance < minWithdraw
              ? `Kumpulkan ${coins(minWithdraw - balance)} lagi`
              : `Tarik ${idr(requested, economy)}`}
          </Button>
        </form>
        </SheetContent>
      </Sheet>

      <section className="panel wallet-history-panel" aria-label="Riwayat penarikan">
        <SectionCardHeading
          icon={Clock}
          title="Riwayat penarikan"
          aside={<Badge variant="secondary">{game.withdrawals.length} permintaan</Badge>}
        />
        {game.withdrawals.length === 0 ? (
          <p className="wallet-empty">
            Belum ada penarikan. Riwayat kamu akan muncul di sini.
          </p>
        ) : (
          <ul className="wallet-history">
            {game.withdrawals.map((item) => (
              <li key={item.id} className="wallet-history-row">
                <div>
                  <h3>{idr(item.coins, economy)}</h3>
                  <p>
                    {methodLabel(item.method)} · {item.account}
                  </p>
                  <p>
                    <time dateTime={new Date(item.createdAt).toISOString()}>
                      {new Date(item.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </p>
                  {item.status === "rejected" && (
                    <p className="wallet-history-refund">
                      {coins(item.coins)} sudah kembali ke saldo.
                    </p>
                  )}
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
