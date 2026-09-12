"use client";

import type { WithdrawStatus } from "@/lib/game";
import { STATUS_SHORT } from "./admin-queue";
import { count, decimal, rupiah, timestamp, type Overview } from "./admin-client";

const STATUS_ORDER: WithdrawStatus[] = [
  "pending",
  "processing",
  "paid",
  "rejected",
];

/**
 * Angka yang tidak pernah muncul di config: berapa rupiah yang sudah dijanjikan
 * Racely. Saldo pemain adalah kewajiban yang menunggu penarikan, dan `pending`
 * adalah kewajiban yang belum diklaim ke saldo. Keduanya uang sungguhan begitu
 * pemain menekan tarik.
 */
export function AdminOverview({ overview }: { overview: Overview }) {
  const { liability, economy, audit } = overview;
  const outstandingCoins = liability.balanceCoins + liability.pendingCoins;
  const queued = liability.byStatus.pending.coins + liability.byStatus.processing.coins;

  return (
    <>
      <section className="adm-panel" aria-label="Kewajiban rupiah">
        <header>
          <div>
            <h2>Kewajiban</h2>
            <p>
              Pada kurs {rupiah(economy.coinToIdr)} per koin. Angka ini yang
              berpindah ke rekening kalau semua pemain menarik hari ini.
            </p>
          </div>
        </header>
        <dl className="adm-grid">
          <div className="adm-stat" data-tone="danger">
            <dt>Total belum ditarik</dt>
            <dd>
              {rupiah(outstandingCoins * economy.coinToIdr)}
              <small>{decimal(outstandingCoins)} koin</small>
            </dd>
          </div>
          <div className="adm-stat" data-tone="warn">
            <dt>Antrean menunggu bayar</dt>
            <dd>
              {rupiah(queued * economy.coinToIdr)}
              <small>
                {liability.byStatus.pending.count +
                  liability.byStatus.processing.count}{" "}
                permintaan
              </small>
            </dd>
          </div>
          <div className="adm-stat">
            <dt>Sudah dibayar</dt>
            <dd>
              {rupiah(liability.byStatus.paid.coins * economy.coinToIdr)}
              <small>{liability.byStatus.paid.count} penarikan</small>
            </dd>
          </div>
          <div className="adm-stat">
            <dt>Saldo bisa ditarik</dt>
            <dd>
              {decimal(liability.balanceCoins)}
              <small>koin di saldo pemain</small>
            </dd>
          </div>
          <div className="adm-stat">
            <dt>Belum diklaim</dt>
            <dd>
              {decimal(liability.pendingCoins)}
              <small>koin masih menumpuk</small>
            </dd>
          </div>
          <div className="adm-stat">
            <dt>Total pernah dicetak</dt>
            <dd>
              {decimal(liability.earnedCoins)}
              <small>koin dari balapan</small>
            </dd>
          </div>
          <div className="adm-stat">
            <dt>Pemain</dt>
            <dd>
              {count(liability.players)}
              <small>{count(liability.activePlayers)} sudah pilih mobil</small>
            </dd>
          </div>
          <div className="adm-stat">
            <dt>Permintaan 7 hari</dt>
            <dd>
              {count(liability.requestedLast7Days)}
              <small>laju antrean masuk</small>
            </dd>
          </div>
        </dl>
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Permintaan</th>
                <th scope="col">Koin</th>
                <th scope="col">Rupiah</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.map((status) => (
                <tr key={status}>
                  <td>
                    <span className="adm-status" data-status={status}>
                      {STATUS_SHORT[status]}
                    </span>
                  </td>
                  <td className="adm-amount">
                    {count(liability.byStatus[status].count)}
                  </td>
                  <td className="adm-amount">
                    {decimal(liability.byStatus[status].coins)}
                  </td>
                  <td className="adm-amount">
                    {rupiah(liability.byStatus[status].coins * economy.coinToIdr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-panel" aria-label="Jejak audit">
        <header>
          <div>
            <h2>Jejak audit</h2>
            <p>
              Setiap perpindahan status dan penyimpanan config, 20 terakhir.
            </p>
          </div>
        </header>
        {audit.length === 0 ? (
          <p className="adm-note">Belum ada aktivitas.</p>
        ) : (
          <ul className="adm-audit">
            {audit.map((row) => (
              <li key={row.id}>
                <time dateTime={row.createdAt}>{timestamp(row.createdAt)}</time>
                <strong>{row.action}</strong>
                {row.target && <code>#{row.target}</code>}
                {row.detail && (
                  <code>
                    {Object.entries(row.detail)
                      .filter(([key]) => key !== "changed")
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(" ")}
                  </code>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
