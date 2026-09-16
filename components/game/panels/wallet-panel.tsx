"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Banknote, Clock, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
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

const WITHDRAW_METHOD_LOGOS: Record<WithdrawMethod, string> = {
  dana: "/payment-methods/dana.svg",
  gopay: "/payment-methods/gopay.svg",
  ovo: "/payment-methods/ovo.svg",
  shopeepay: "/payment-methods/shopee-pay.svg",
  bca: "/payment-methods/bca.svg",
  bri: "/payment-methods/bri.svg",
  bni: "/payment-methods/bni.svg",
  mandiri: "/payment-methods/mandiri.svg",
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
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const maxWithdraw = economy.maxWithdrawCoins;
  const balance = Math.floor(game.balance);
  const formDisabled = disabled;
  const requested = Number.parseInt(amount, 10) || 0;
  const isBank =
    WITHDRAW_METHODS.find((item) => item.id === method)?.kind === "bank";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (formDisabled) return;
    if (!Number.isInteger(requested) || requested < minWithdraw) {
      toast.error(`Minimal ${coins(minWithdraw)}.`);
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
      setAmount("");
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
            disabled={disabled}
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
        <SheetContent side="bottom" className="game-sheet withdraw-sheet" initialFocus={false}>
          <SheetHeader>
            <SheetTitle>Tarik koin</SheetTitle>
            <SheetDescription>Koin hasil balapan, jadi rupiah.</SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <form id="withdraw-form" className="wallet-form" onSubmit={submit}>
              <section className="withdraw-amount-card" aria-label="Nominal penarikan">
                <div className="withdraw-balance-row">
                  <span><Wallet aria-hidden="true" /> Saldo tersedia</span>
                  <strong>{formatCoins(balance)} <span>koin</span></strong>
                </div>
                <div className="withdraw-amount-heading">
                  <label htmlFor="withdraw-amount">Jumlah penarikan</label>
                  <button
                    type="button"
                    className="withdraw-all"
                    disabled={formDisabled}
                    onClick={() => setAmount(String(Math.min(balance, maxWithdraw)))}
                  >
                    Semua
                  </button>
                </div>
                <div className="withdraw-amount-input">
                  <input
                    id="withdraw-amount"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={amount ? formatCoins(requested) : ""}
                    disabled={formDisabled}
                    onChange={(event) =>
                      setAmount(event.target.value.replace(/\D/g, "").slice(0, amountDigits(maxWithdraw)))
                    }
                  />
                  <span>koin</span>
                </div>
                <div className="wallet-chips" role="group" aria-label="Nominal cepat">
                  {quickAmounts(minWithdraw, maxWithdraw).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={cn("wallet-chip", requested === value && "is-active")}
                      aria-pressed={requested === value}
                      aria-label={`${formatCoins(value)} koin`}
                      disabled={formDisabled || value > balance}
                      onClick={() => setAmount(String(value))}
                    >
                      {formatCoins(value)}
                    </button>
                  ))}
                </div>
              </section>


              <fieldset className="wallet-method-fieldset withdraw-destination">
                <legend>Tujuan penarikan</legend>
                {(["ewallet", "bank"] as const).map((kind) => (
                  <div className="wallet-method-group" key={kind}>
                    <p>
                      {kind === "bank" ? <Banknote aria-hidden="true" /> : <Wallet aria-hidden="true" />}
                      {kind === "bank" ? "Transfer bank" : "E-wallet"}
                    </p>
                    <div className="wallet-methods">
                      {WITHDRAW_METHODS.filter((item) => item.kind === kind).map((item) => (
                        <label key={item.id} className="wallet-method">
                          <input
                            type="radio"
                            name="withdraw-method"
                            value={item.id}
                            checked={method === item.id}
                            disabled={formDisabled}
                            onChange={() => setMethod(item.id)}
                            aria-label={item.label}
                            className="sr-only"
                          />
                          <Image
                            src={WITHDRAW_METHOD_LOGOS[item.id]}
                            alt=""
                            width={56}
                            height={20}
                            sizes="56px"
                            className="withdraw-method-logo"
                          />
                          <span className="withdraw-method-dot" aria-hidden="true" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>

              <div className="withdraw-recipient">
                <div className="wallet-field">
                  <label htmlFor="withdraw-account">
                    {isBank ? "Nomor rekening" : "Nomor e-wallet"} <span>· {methodLabel(method)}</span>
                  </label>
                  <input
                    id="withdraw-account"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={isBank ? "Masukkan nomor rekening" : "08xxxxxxxxxx"}
                    value={account}
                    disabled={formDisabled}
                    onChange={(event) => setAccount(event.target.value.replace(/\D/g, "").slice(0, 18))}
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
                    disabled={formDisabled}
                    onChange={(event) => setAccountName(event.target.value.slice(0, 60))}
                    className="wallet-input"
                  />
                </div>
              </div>
              {error && <p className="wallet-error" role="alert">{error}</p>}
            </form>
          </div>
          <SheetFooter>
            <div className="withdraw-summary" aria-live="polite" aria-atomic="true">
              <div><span>Kamu menerima</span><strong>{idr(requested, economy)}</strong></div>
              <span>Ke {methodLabel(method)}</span>
            </div>
            <Button type="submit" form="withdraw-form" variant="gold" disabled={formDisabled}>
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
