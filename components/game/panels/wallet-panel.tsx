"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Clock, Send, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SectionCardHeading } from "../shell/section-card-heading";
import { StatHero } from "../shell/stat-hero";
import { cn } from "@/lib/utils";
import {
  accountPattern,
  coinRate,
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
 * disetel lebih tinggi dari panel akan membuat chip terendah menawarkan
 * penarikan yang pasti ditolak server. Pada nilai bawaan hasilnya
 * 200.000/500.000/1.000.000/2.000.000.
 *
 * Ikut dipagari batas ATAS. Kelipatannya bisa melewati `maxWithdrawCoins`
 * (min 100 + max 500 menghasilkan chip 1000), dan chip yang ditawarkan sendiri
 * lalu ditolak server sendiri adalah tombol yang memancing pemain gagal.
 * Duplikat dibuang supaya rentang yang sempit tidak memunculkan chip kembar.
 */
const quickAmounts = (min: number, max: number) => [
  ...new Set(
    [min, min * 2.5, min * 5, min * 10]
      .map((value) => Math.round(value))
      .filter((value) => value <= max),
  ),
];

/**
 * Berapa digit yang boleh diketik, diturunkan dari batas penarikan yang berlaku.
 * Dulu dipatok 7 digit: begitu operator menaikkan `maxWithdrawCoins` di atas
 * 9.999.999 (skemanya mengizinkan sampai satu miliar), nominal yang sah jadi
 * tidak bisa diketik sama sekali -- sementara tombol "Semua" menyetelnya
 * langsung tanpa lewat pemotongan ini, jadi dua jalur memakai dua aturan.
 */
const amountDigits = (max: number) => String(Math.max(1, Math.floor(max))).length;

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

  const maxWithdraw = economy.maxWithdrawCoins;
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
      <StatHero
        ariaLabel="Saldo koin"
        label="Koin kamu"
        figure={balance}
        action={
          <Button
            variant="gold"
            disabled={disabled || balance < minWithdraw}
            onClick={() => setOpen(true)}
          >
            <Send data-icon="inline-start" />
            Tarik koin
          </Button>
        }
        stats={[
          { label: "Belum diklaim", value: coins(game.pending) },
          { label: "Min. tarik", value: coins(minWithdraw) },
        ]}
      />

      <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
        <SheetContent side="bottom" className="game-sheet">
          <SheetHeader>
            <SheetTitle>Tarik koin</SheetTitle>
            <SheetDescription>
              {formatCoins(balance)} koin tersedia · {coinRate(economy)}
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
          <p className="sheet-note">
            Permintaan diproses manual oleh tim Racely dalam 3–5 hari kerja.
            Cek lagi nomor dan nama tujuan sebelum kirim. Kalau ditolak, koinnya
            kembali ke saldo kamu.
          </p>
        <form id="withdraw-form" className="wallet-form" onSubmit={submit}>
          <div className="wallet-field">
            <label htmlFor="withdraw-amount">Jumlah koin</label>
            <input
              id="withdraw-amount"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(event) =>
                setAmount(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, amountDigits(maxWithdraw)),
                )
              }
              className="wallet-input"
              aria-describedby="withdraw-amount-note"
            />
            <p id="withdraw-amount-note">
              {formatCoins(requested)} koin = {idr(requested, economy)} · minimal {coins(minWithdraw)}
            </p>
          </div>

          <div className="wallet-chips" role="group" aria-label="Nominal cepat">
            {quickAmounts(minWithdraw, maxWithdraw).map((value) => (
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
              onClick={() => setAmount(String(Math.min(balance, maxWithdraw)))}
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
        </form>
          </div>
          <SheetFooter>
            <Button
              type="submit"
              form="withdraw-form"
              variant="gold"
              disabled={disabled || balance < minWithdraw}
            >
              <Send data-icon="inline-start" />
              Kirim permintaan
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <section className="panel wallet-history-panel" aria-label="Riwayat penarikan">
        <SectionCardHeading
          icon={Clock}
          title="Riwayat penarikan"
          aside={<Badge variant="secondary">{game.withdrawals.length} permintaan</Badge>}
        />
        {game.withdrawals.length === 0 ? (
          <div className="wallet-empty">
            <Banknote aria-hidden="true" />
            <h3>Belum ada penarikan</h3>
            <p>
              Kumpulkan minimal {coins(minWithdraw)}, lalu tarik ke e-wallet
              atau rekening. Riwayat permintaanmu akan muncul di sini.
            </p>
          </div>
        ) : (
          <ul className="wallet-history">
            {game.withdrawals.map((item) => (
              <li key={item.id} className="wallet-history-row">
                <div>
                  <h3>{coins(item.coins)}</h3>
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
