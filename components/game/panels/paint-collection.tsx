"use client";

import { Palette, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PAINT_IDS, PAINT_CATALOG, type PaintCommand } from "@/lib/car-paints";
import { cosmeticPriceAt } from "@/lib/economy-config";
import { coins, formatCoins, type GameState } from "@/lib/game";
import { cn } from "@/lib/utils";
import { SectionCardHeading } from "../shell/section-card-heading";

/**
 * Anatominya sama dengan Bengkel dan Setup (.upgrade-row): tile + nama +
 * tombol kecil di satu baris. Tile-nya diisi warna catnya sendiri -- itu
 * satu-satunya informasi yang benar-benar dibeli pemain, jadi ia yang
 * menggantikan ikon. Harga dan kekurangan saldo cukup satu baris metrik;
 * kotak aksi besar milik panel hadiah tidak dipakai karena ini toko, bukan
 * klaim.
 */
export function PaintCollection({ game, disabled, onAction }: {
  game: GameState;
  disabled: boolean;
  onAction: (action: PaintCommand) => Promise<boolean>;
}) {
  const ownedCount = game.ownedPaints?.length ?? 0;
  return <section className="panel upgrade-panel" aria-label="Koleksi cat">
    <SectionCardHeading icon={Palette} title="Koleksi cat" aside={<Badge variant="secondary">{ownedCount}/{PAINT_IDS.length} dimiliki</Badge>} />
    <ul className="upgrade-list">
      {PAINT_IDS.map(id => {
        const paint = PAINT_CATALOG[id];
        const price = cosmeticPriceAt(game.economy, paint.tier);
        const owned = game.ownedPaints?.includes(id) ?? false;
        const active = game.color === paint.color;
        const shortfall = Math.max(0, price - game.balance);
        const affordable = shortfall === 0;
        return <li key={id} className={cn("upgrade-row paint-row", active && "is-active", !owned && affordable && "is-ready")}>
          <div className="upgrade-head">
            <span className="upgrade-icon paint-swatch" style={{ backgroundColor: paint.color }} aria-hidden="true" />
            <div className="upgrade-name">
              <h3>{paint.name}</h3>
              <p className="setup-metric">
                {owned
                  ? "Milikmu selamanya"
                  : <>
                    <b>{formatCoins(price)}</b> koin
                    {!affordable && <><span aria-hidden="true"> · </span>kurang {formatCoins(shortfall)}</>}
                  </>}
              </p>
            </div>
            {active
              ? <Badge variant="secondary" className="upgrade-buy"><Check data-icon="inline-start" aria-hidden="true" />Terpasang</Badge>
              : <Button
                variant={owned ? "secondary" : "goldSoft"}
                size="sm"
                className="upgrade-buy"
                disabled={disabled || (!owned && !affordable)}
                onClick={() => void onAction({ type: owned ? "equip-paint" : "buy-paint", paintId: id })}
                aria-label={`${owned ? "Pasang" : "Beli"} ${paint.name}${owned ? "" : ` seharga ${coins(price)}`}`}
              >
                {owned ? "Pasang" : "Beli"}
              </Button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
