"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Check, Coins, Gift, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCoins } from "@/lib/game";

function BonusConfetti({ claimed }: { claimed: boolean }) {
  return (
    <div className="starter-confetti" aria-hidden="true" key={claimed ? "claimed" : "welcome"}>
      {Array.from({ length: 36 }, (_, index) => (
        <i
          key={index}
          style={{
            "--confetti-x": `${(index * 37) % 100}%`,
            "--confetti-drift": `${((index * 19) % 120) - 60}px`,
            "--confetti-delay": `${(index % 9) * 0.09}s`,
            "--confetti-turn": `${(index % 2 ? 1 : -1) * (180 + index * 23)}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function StarterBonusDialog({
  open, amount, claimed, busy, failed, onClaim, onClose, onGarage,
}: {
  open: boolean;
  amount: number;
  claimed: boolean;
  busy: boolean;
  failed: boolean;
  onClaim: () => Promise<void>;
  onClose: () => void;
  onGarage: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose(); }}>
      <SheetContent side="bottom" className="game-sheet starter-bonus" showCloseButton={!busy}>
        <BonusConfetti claimed={claimed} />
        <div className="starter-bonus-content">
          <SheetHeader>
            <p className="starter-eyebrow"><Sparkles aria-hidden="true" /> Hadiah pemain baru</p>
            <div className="starter-emblem" data-claimed={claimed} aria-hidden="true">
              {claimed ? <Check /> : <Gift />}
            </div>
            <SheetTitle>{claimed ? "Bonus berhasil diklaim!" : "Start lebih kencang!"}</SheetTitle>
            <SheetDescription>
              {claimed ? "Koin sudah masuk ke saldomu. Saatnya upgrade mobil!" : "Selamat datang di Racely. Modal balapan pertamamu sudah siap!"}
            </SheetDescription>
          </SheetHeader>
          <div className="starter-prize" aria-live="polite">
            <span>Bonus starter</span>
            <strong>+{formatCoins(amount)}</strong>
            <span className="starter-currency"><Coins aria-hidden="true" /> Koin Racely</span>
            <p>{claimed ? "Masuk ke saldo" : "Gratis · Sekali per pemain"}</p>
          </div>
          {failed && !claimed && <p className="starter-feedback" role="alert">Bonus belum terkonfirmasi. Coba klaim lagi.</p>}
          <SheetFooter>
            <Button variant="gold" size="lg" disabled={busy} onClick={claimed ? onGarage : onClaim}>
              {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : claimed ? <ArrowRight data-icon="inline-start" aria-hidden="true" /> : <Gift data-icon="inline-start" aria-hidden="true" />}
              {busy ? "Mengklaim bonus…" : claimed ? "Upgrade mobilku" : "Klaim bonus gratis"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {claimed ? "Lanjut balapan" : "Nanti saja"}
            </Button>
            {!claimed && <p className="sheet-footnote">Bisa dipakai untuk upgrade di garasi.</p>}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
