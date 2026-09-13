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
  const { liability, economy, audit, emission } = overview;
  // Anggaran 0 berarti tanpa anggaran dan tanpa rem; tidak ada yang bisa
  // ditampilkan sebagai persentase, jadi bar-nya ikut hilang.
  const budget = economy.dailyEmissionBudgetIdr;
  const usedShare = budget > 0 ? emission.todayIdr / budget : 0;
  const overBudget = budget > 0 && usedShare >= 1;
  const nearBudget = budget > 0 && !overBudget && usedShare >= 0.8;
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

      <section className="panel wallet-history-panel" aria-label="Emisi koin">
        <SectionCardHeading
          icon={Coins}
          title="Emisi koin"
          aside={
            <InfoHint title="Cara baca emisi">
              Koin baru yang dicetak per hari balapan (WIB), dicatat saat
              pencetakan dengan kurs yang berlaku saat itu -- menyetel nilai koin
              belakangan tidak menulis ulang angka ini. Pencatatan dimulai sejak
              migrasi 0011, jadi hari sebelum itu kosong, bukan nol.
            </InfoHint>
          }
        />
        {(overBudget || nearBudget) && (
          <p className="admin-notice" data-tone={overBudget ? "error" : undefined} role="status">
            {overBudget
              ? `Anggaran harian terlampaui: ${rupiah(emission.todayIdr)} dari ${rupiah(budget)}. Pengali hadiah putaran diturunkan sampai hari berganti.`
              : `Emisi hari ini ${Math.round(usedShare * 100)}% dari anggaran ${rupiah(budget)}.`}
          </p>
        )}
        <div className="admin-figures">
          <div className="admin-figure">
            <span className="eyebrow">Hari ini</span>
            <strong>{rupiah(emission.todayIdr)}</strong>
            <span>{decimal(emission.today)} koin dicetak</span>
          </div>
          <div className="admin-figure">
            <span className="eyebrow">Anggaran harian</span>
            <strong>{budget > 0 ? rupiah(budget) : "—"}</strong>
            <span>
              {budget > 0
                ? `terpakai ${Math.round(usedShare * 100)}%`
                : "tanpa anggaran & tanpa rem"}
            </span>
          </div>
          <div className="admin-figure">
            <span className="eyebrow">7 hari</span>
            <strong>{rupiah(emission.weekIdr)}</strong>
            <span>{decimal(emission.week)} koin</span>
          </div>
          <div className="admin-figure">
            <span className="eyebrow">30 hari</span>
            <strong>{rupiah(emission.monthIdr)}</strong>
            <span>{decimal(emission.month)} koin</span>
          </div>
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
