"use client";

import { Palette, Check, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PAINT_IDS, PAINT_CATALOG, isReferralPaint, paintReferralRequirement, type PaintCommand } from "@/lib/car-paints";
import { cosmeticPriceAt } from "@/lib/economy-config";
import { coins, formatCoins, type GameState } from "@/lib/game";
import { referralRewardUnlocked } from "@/lib/referral-rewards";
import { cn } from "@/lib/utils";
import { SectionCardHeading } from "../shell/section-card-heading";

/**
 * Anatominya sama dengan Bengkel dan Setup (.upgrade-row): tile + nama +
 * tombol kecil di satu baris. Tile-nya diisi warna catnya sendiri -- itu
 * satu-satunya informasi yang benar-benar dibeli pemain, jadi ia yang
 * menggantikan ikon. Harga dan kekurangan saldo cukup satu baris metrik;
 * kotak aksi besar milik panel hadiah tidak dipakai karena ini toko, bukan
 * klaim.
 *
 * Cat hadiah ajakan (`isReferralPaint`) tidak punya harga: barisnya membaca
 * `referral.completed` -- metrik yang sama yang dipakai server -- dan
 * tombolnya `equip-paint` langsung begitu ambang tercapai; hadiah masuk
 * koleksi saat pertama dipasang.
 */
export function PaintCollection({ game, disabled, onAction }: {
  game: GameState;
  disabled: boolean;
  onAction: (action: PaintCommand) => Promise<boolean>;
}) {
  const ownedCount = game.ownedPaints?.length ?? 0;
  const friends = game.referral.completed;
  return <section id="paint-collection" tabIndex={-1} className="panel upgrade-panel" aria-label="Koleksi cat">
    <SectionCardHeading icon={Palette} title="Koleksi cat" aside={<Badge variant="secondary">{ownedCount}/{PAINT_IDS.length} dimiliki</Badge>} />
    <ul className="upgrade-list">
      {PAINT_IDS.map(id => {
        const paint = PAINT_CATALOG[id];
        const exclusive = isReferralPaint(id);
        const price = cosmeticPriceAt(game.economy, paint.tier);
        const owned = game.ownedPaints?.includes(id) ?? false;
        const active = game.color === paint.color;
        const shortfall = Math.max(0, price - game.balance);
        const affordable = shortfall === 0;
        const unlocked = !exclusive || referralRewardUnlocked("paint", id, friends);
        const ready = !owned && (exclusive ? unlocked : affordable);
        const needed = exclusive ? paintReferralRequirement(id) ?? 0 : 0;
        return <li key={id} className={cn("upgrade-row paint-row", active && "is-active", ready && "is-ready", !unlocked && "is-locked")}>
          <div className="upgrade-head">
            <span className="upgrade-icon paint-swatch" style={{ backgroundColor: paint.color }} aria-hidden="true" />
            <div className="upgrade-name">
              <h3>{paint.name}</h3>
              <p className="setup-metric">
                {owned
                  ? "Milikmu selamanya"
                  : exclusive
                    ? <>
                      <b>{needed} teman</b>
                      <span aria-hidden="true"> · </span>
                      {unlocked ? "Hadiah ajakan, terbuka" : `kurang ${needed - friends}`}
                    </>
                    : <>
                      <b>{formatCoins(price)}</b> koin
                      {!affordable && <><span aria-hidden="true"> · </span>kurang {formatCoins(shortfall)}</>}
                    </>}
              </p>
            </div>
            {active
              ? <Badge variant="secondary" className="upgrade-buy"><Check data-icon="inline-start" aria-hidden="true" />Terpasang</Badge>
              : !unlocked
                ? <Button variant="secondary" size="sm" className="upgrade-buy" disabled aria-label={`${paint.name} terkunci, ajak ${needed} teman`}>
                  <LockKeyhole data-icon="inline-start" aria-hidden="true" />Terkunci
                </Button>
                : <Button
                  variant={owned ? "secondary" : "goldSoft"}
                  size="sm"
                  className="upgrade-buy"
                  disabled={disabled || (!owned && !exclusive && !affordable)}
                  onClick={() => void onAction({ type: owned || exclusive ? "equip-paint" : "buy-paint", paintId: id })}
                  aria-label={`${owned || exclusive ? "Pasang" : "Beli"} ${paint.name}${owned || exclusive ? "" : ` seharga ${coins(price)}`}`}
                >
                  {owned || exclusive ? "Pasang" : "Beli"}
                </Button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
