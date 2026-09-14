"use client";

import { Palette, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PAINT_IDS, PAINT_CATALOG, type PaintCommand } from "@/lib/car-paints";
import { cosmeticPriceAt } from "@/lib/economy-config";
import { coins, formatCoins, type GameState } from "@/lib/game";
import { cn } from "@/lib/utils";
import { SectionCardHeading } from "../shell/section-card-heading";

export function PaintCollection({ game, disabled, onAction }: {
  game: GameState;
  disabled: boolean;
  onAction: (action: PaintCommand) => Promise<boolean>;
}) {
  return <section className="panel rewards-list-panel" aria-label="Koleksi cat">
    <SectionCardHeading icon={Palette} title="Koleksi cat" aside={<Badge variant="secondary">{game.ownedPaints?.length ?? 0}/{PAINT_IDS.length} dimiliki</Badge>} />
    <p className="px-xl pb-md text-read text-muted-foreground">Target koleksi jangka panjang. Hanya mengubah warna, tanpa bonus kecepatan atau penghasilan. Beli sekali, pasang gratis; warna bawaan tetap gratis.</p>
    <ul className="reward-list">
      {PAINT_IDS.map(id => {
        const paint = PAINT_CATALOG[id];
        const price = cosmeticPriceAt(game.economy, paint.tier);
        const owned = game.ownedPaints?.includes(id) ?? false;
        const active = game.color === paint.color;
        const shortfall = Math.max(0, price - game.balance);
        const affordable = shortfall === 0;
        return <li key={id} className={cn("reward-row", !owned && affordable && "is-ready", owned && "is-claimed")}>
          <span className="reward-row-icon" style={{ backgroundColor: paint.color }} aria-hidden="true" />
          <div className="reward-row-copy">
            <h3>{paint.name}</h3>
            <p>{owned ? "Milikmu selamanya" : affordable ? "Saldo cukup, beli sekali pasang gratis." : `Kurang ${coins(shortfall)} lagi.`}</p>
          </div>
          <div className="reward-row-action">
            <strong>{owned ? "Dimiliki" : <>{formatCoins(price)} <span>koin</span></>}</strong>
            {active ? <span className="mission-status"><Check aria-hidden="true" />Terpasang</span> : <Button variant={owned ? "secondary" : "goldSoft"} disabled={disabled || (!owned && !affordable)} onClick={() => void onAction({ type: owned ? "equip-paint" : "buy-paint", paintId: id })} aria-label={`${owned ? "Pasang" : "Beli"} ${paint.name}${owned ? "" : ` seharga ${coins(price)}`}`}>{owned ? "Pasang" : "Beli"}</Button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
