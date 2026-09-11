"use client";

import { useMemo, useState } from "react";
import {
  BanknoteArrowUp,
  Coins,
  History,
  Info,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  accountPattern,
  coins as coinLabel,
  formatCoins,
  idr,
  methodLabel,
  MIN_WITHDRAW_COINS,
  WITHDRAW_METHODS,
  WITHDRAW_STATUS_LABEL,
  type GameState,
  type WithdrawMethod,
} from "@/lib/game";

export type WithdrawInput = {
  method: WithdrawMethod;
  account: string;
  accountName: string;
  coins: number;
};

const QUICK_AMOUNTS = [100, 250, 500];

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function WalletPanel({
  game,
  onWithdraw,
  onOpenRewards,
  disabled = false,
}: {
  game: GameState;
  onWithdraw: (input: WithdrawInput) => Promise<boolean>;
  onOpenRewards: () => void;
  disabled?: boolean;
}) {
  const [method, setMethod] = useState<WithdrawMethod>("dana");
  const [amount, setAmount] = useState(String(MIN_WITHDRAW_COINS));
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isBank =
    WITHDRAW_METHODS.find((item) => item.id === method)?.kind === "bank";
  const requested = Number.parseInt(amount, 10);
  const validAmount = useMemo(
    () =>
      Number.isInteger(requested) &&
      requested >= MIN_WITHDRAW_COINS &&
      requested <= game.balance,
    [requested, game.balance],
  );
  const ready =
    validAmount &&
    accountPattern(method).test(account.trim()) &&
    accountName.trim().length >= 2;

  const submit = async () => {
    if (!Number.isInteger(requested) || requested < MIN_WITHDRAW_COINS) {
      setFormError(`Minimal penarikan ${coinLabel(MIN_WITHDRAW_COINS)}.`);
      return;
    }
    if (requested > game.balance) {
      setFormError("Saldo koin belum cukup untuk jumlah ini.");
      return;
    }
    if (!accountPattern(method).test(account.trim())) {
      setFormError(
        isBank
          ? "Nomor rekening harus 8-18 digit angka."
          : "Nomor e-wallet harus diawali 08 dan berisi 10-14 digit.",
      );
      return;
    }
    if (accountName.trim().length < 2) {
      setFormError("Isi nama pemilik rekening sesuai buku tabungan.");
      return;
    }
    setFormError(null);
    const done = await onWithdraw({
      method,
      account: account.trim(),
      accountName: accountName.trim(),
      coins: requested,
    });
    if (done) {
      setAmount(String(MIN_WITHDRAW_COINS));
      setAccount("");
    }
  };

  return (
    <div className="section-enter flex flex-col gap-2.5">
      <section className="wallet-hero" aria-label="Saldo koin">
        <span className="eyebrow">Saldo bisa ditarik</span>
        <strong>{formatCoins(game.balance)}</strong>
        <p>
          Setara {idr(game.balance)} · {coinLabel(game.pending)} lagi diproses di
          lintasan
        </p>
        <div className="wallet-hero-meta">
          <span>
            <Coins aria-hidden="true" />1 koin = {idr(1)}
          </span>
          <span>
            <ShieldCheck aria-hidden="true" />
            Minimal {formatCoins(MIN_WITHDRAW_COINS)} koin
          </span>
        </div>
      </section>

      <section className="panel wallet-form" aria-label="Tarik koin">
        <div className="section-card-heading">
          <h2>
            <BanknoteArrowUp aria-hidden="true" />
            Tarik koin
          </h2>
          <span>{idr(Number.isInteger(requested) ? requested : 0)}</span>
        </div>

        <div className="wallet-field">
          <label htmlFor="withdraw-amount">Jumlah koin</label>
          <input
            id="withdraw-amount"
            className="wallet-input"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/\D/g, "").slice(0, 7))
            }
            aria-describedby="withdraw-amount-note"
          />
          <div className="wallet-chips" role="group" aria-label="Jumlah cepat">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "wallet-chip",
                  requested === value && "is-selected",
                )}
                disabled={value > game.balance}
                onClick={() => setAmount(String(value))}
              >
                {formatCoins(value)}
              </button>
            ))}
            <button
              type="button"
              className="wallet-chip"
              disabled={game.balance < MIN_WITHDRAW_COINS}
              onClick={() => setAmount(String(Math.floor(game.balance)))}
            >
              Semua
            </button>
          </div>
          <p id="withdraw-amount-note" className="wallet-hint">
            Minimal {coinLabel(MIN_WITHDRAW_COINS)} ({idr(MIN_WITHDRAW_COINS)})
            per penarikan. Tanpa biaya admin.
          </p>
        </div>

        <div className="wallet-field">
          <span className="wallet-label">Metode</span>
          <div className="wallet-methods" role="radiogroup" aria-label="Metode penarikan">
            {WITHDRAW_METHODS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={method === item.id}
                className={cn(
                  "wallet-method",
                  method === item.id && "is-selected",
                )}
                onClick={() => {
                  setMethod(item.id);
                  setAccount("");
                }}
              >
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
            className="wallet-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder={isBank ? "1234567890" : "08123456789"}
            value={account}
            onChange={(event) =>
              setAccount(event.target.value.replace(/\D/g, "").slice(0, 18))
            }
          />
        </div>

        <div className="wallet-field">
          <label htmlFor="withdraw-name">Nama pemilik</label>
          <input
            id="withdraw-name"
            className="wallet-input"
            autoComplete="name"
            placeholder="Nama sesuai rekening"
            value={accountName}
            maxLength={60}
            onChange={(event) => setAccountName(event.target.value)}
          />
        </div>

        {formError && (
          <p className="wallet-error" role="alert">
            {formError}
          </p>
        )}

        <Button
          variant="gold"
          size="lg"
          className="w-full"
          disabled={disabled || !ready}
          onClick={submit}
        >
          <Wallet data-icon="inline-start" />
          Ajukan penarikan
        </Button>
        {game.balance < MIN_WITHDRAW_COINS && (
          <Button variant="secondary" className="w-full" onClick={onOpenRewards}>
            Kumpulkan koin dulu
          </Button>
        )}
      </section>

      <section className="panel wallet-history" aria-label="Riwayat penarikan">
        <div className="section-card-heading">
          <h2>
            <History aria-hidden="true" />
            Riwayat penarikan
          </h2>
          <span>{game.withdrawals.length} permintaan</span>
        </div>
        {game.withdrawals.length === 0 ? (
          <p className="wallet-empty">
            Belum ada penarikan. Koin hasil balapanmu aman tersimpan.
          </p>
        ) : (
          <ul className="wallet-history-list">
            {game.withdrawals.map((row) => (
              <li key={row.id} className="wallet-history-row">
                <div>
                  <h3>{methodLabel(row.method)}</h3>
                  <p>
                    {row.account} · {dateLabel(row.createdAt)}
                  </p>
                </div>
                <div className="wallet-history-amount">
                  <strong>{idr(row.coins)}</strong>
                  <span data-status={row.status}>
                    {WITHDRAW_STATUS_LABEL[row.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rewards-note">
        <Info size={12} aria-hidden="true" /> Penarikan diverifikasi manual oleh
        tim Racely dan diproses maksimal 3 hari kerja. Pastikan nama pemilik
        rekening sama dengan akun Telegram yang kamu pakai.
      </p>
    </div>
  );
}
