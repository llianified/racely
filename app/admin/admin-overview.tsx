"use client";

import { Coins, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/game/panels/info-hint";
import { SectionCardHeading } from "@/components/game/shell/section-card-heading";
import type { WithdrawStatus } from "@/lib/game";
import { STATUS_SHORT } from "./admin-queue";
import { count, decimal, rupiah, timestamp, type Overview } from "./admin-client";

const STATUS_ORDER: WithdrawStatus[] = ["pending", "processing", "paid", "rejected"];

/**
 * Angka yang tidak pernah muncul di config: berapa rupiah yang sudah
 * dijanjikan Racely. Saldo pemain adalah kewajiban yang menunggu penarikan,
 * dan `pending` adalah kewajiban yang belum diklaim ke saldo. Keduanya uang
 * sungguhan begitu pemain menekan tarik.
 */
export function AdminOverview({ overview }: { overview: Overview }) {
  const { liability, economy, audit } = overview;
  const outstandingCoins = liability.balanceCoins + liability.pendingCoins;
  const queuedCoins =
    liability.byStatus.pending.coins + liability.byStatus.processing.coins;
  const queuedCount =
    liability.byStatus.pending.count + liability.byStatus.processing.count;

  return (
    <>
      <section className="wallet-hero" aria-label="Kewajiban rupiah">
        <div className="wallet-balance">
          <span className="eyebrow">Belum ditarik</span>
          <strong>
            {rupiah(outstandingCoins * economy.coinToIdr)}
          </strong>
          <p>{decimal(outstandingCoins)} koin di tangan pemain</p>
        </div>
        <div className="wallet-hero-side">
          <span className="wallet-pending">
            <Coins aria-hidden="true" />
            {rupiah(queuedCoins * economy.coinToIdr)} menunggu dibayar
          </span>
          <InfoHint title="Cara baca angka ini">
            Dihitung pada kurs {rupiah(economy.coinToIdr)} per koin. Ini yang
            berpindah ke rekening kalau semua pemain menarik hari ini. Koin
            &quot;belum diklaim&quot; ikut dihitung karena satu klik memindahkannya
            ke saldo.
          </InfoHint>
        </div>
      </section>

      <section className="panel wallet-history-panel" aria-label="Rincian kewajiban">
        <SectionCardHeading
          icon={Coins}
          title="Rincian"
          aside={<Badge variant="secondary">{queuedCount} di antrean</Badge>}
        />
        <div className="admin-figures">
          <div className="admin-figure">
            <span className="eyebrow">Saldo siap tarik</span>
            <strong>{decimal(liability.balanceCoins)}</strong>
            <span>koin</span>
          </div>
          <div className="admin-figure">
            <span className="eyebrow">Belum diklaim</span>
            <strong>{decimal(liability.pendingCoins)}</strong>
            <span>koin menumpuk</span>
          </div>
          <div className="admin-figure">
            <span className="eyebrow">Pernah dicetak</span>
            <strong>{decimal(liability.earnedCoins)}</strong>
            <span>koin dari balapan</span>
          </div>
          <div className="admin-figure">
            <span className="eyebrow">Pemain aktif</span>
            <strong>{count(liability.activePlayers)}</strong>
            <span>dari {count(liability.players)} terdaftar</span>
          </div>
        </div>
        <ul className="admin-audit">
          {STATUS_ORDER.map((status) => (
            <li key={status}>
              <strong>{STATUS_SHORT[status]}</strong>
              <time>
                {count(liability.byStatus[status].count)} ·{" "}
                {rupiah(liability.byStatus[status].coins * economy.coinToIdr)}
              </time>
            </li>
          ))}
          <li>
            <strong>Permintaan 7 hari</strong>
            <time>{count(liability.requestedLast7Days)}</time>
          </li>
        </ul>
      </section>

      <section className="panel wallet-history-panel" aria-label="Jejak audit">
        <SectionCardHeading
          icon={ScrollText}
          title="Jejak audit"
          aside={
            <InfoHint title="Apa yang dicatat">
              Setiap perpindahan status penarikan dan setiap penyimpanan config
              ekonomi, 20 terakhir.
            </InfoHint>
          }
        />
        {audit.length === 0 ? (
          <p className="wallet-empty">Belum ada aktivitas.</p>
        ) : (
          <ul className="admin-audit">
            {audit.map((row) => (
              <li key={row.id}>
                <strong>
                  {row.action}
                  {row.target ? ` #${row.target}` : ""}
                </strong>
                <time dateTime={row.createdAt}>{timestamp(row.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
