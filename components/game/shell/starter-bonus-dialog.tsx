"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Check, Coins, Flag, Gift, LoaderCircle, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCoins } from "@/lib/game";

function BonusConfetti() {
  return (
    <div className="starter-confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <i
          key={index}
          style={{
            "--confetti-x": `${(index * 37) % 100}%`,
            "--confetti-drift": `${((index * 19) % 80) - 40}px`,
            "--confetti-delay": `${(index % 6) * 0.07}s`,
            "--confetti-turn": `${(index % 2 ? 1 : -1) * (90 + index * 17)}deg`,
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
        {claimed && <BonusConfetti />}
        <div className="starter-bonus-content">
          <div className="starter-topline">
            <Flag aria-hidden="true" />
            <span>Racely <span aria-hidden="true">/</span> Starter pack</span>
          </div>
          <SheetHeader>
            <SheetTitle>
              {claimed ? "Bekal siap." : "Modal awal."}
              <span>{claimed ? "Waktunya melaju." : "Gas ke lintasan."}</span>
            </SheetTitle>
            <SheetDescription>
              {claimed ? "Bonus sudah masuk ke saldo. Racik performa mobilmu sebelum kembali balapan." : "Mobil sudah siap. Ambil bonus pertamamu untuk mulai upgrade di garasi."}
            </SheetDescription>
          </SheetHeader>
          <section className="starter-prize" aria-label="Bonus starter">
            <div className="starter-prize-heading">
              <span><Gift aria-hidden="true" /> Bonus starter</span>
              <Badge variant="secondary" aria-live="polite" aria-atomic="true">
                {claimed && <Check data-icon="inline-start" aria-hidden="true" />}
                {claimed ? "Diklaim" : "Siap diklaim"}
              </Badge>
            </div>
            <strong>+{formatCoins(amount)}</strong>
            <span className="starter-currency"><Coins aria-hidden="true" /> Koin Racely</span>
            <div className="starter-prize-meta">
              <span>{claimed ? <Check aria-hidden="true" /> : <Gift aria-hidden="true" />}{claimed ? "Masuk ke saldo" : "Gratis untukmu"}</span>
              <span>Sekali per pemain</span>
            </div>
          </section>
          <div className="starter-next">
            <span className="starter-next-icon"><Wrench aria-hidden="true" /></span>
            <p><strong>Langkah berikutnya: garasi</strong><span>Upgrade mobil, maksimalkan tiap putaran.</span></p>
          </div>
          {failed && !claimed && <p className="starter-feedback" role="alert">Bonus belum terkonfirmasi. Coba klaim lagi.</p>}
        </div>
        <SheetFooter>
          <Button variant="gold" size="lg" disabled={busy} onClick={claimed ? onGarage : onClaim}>
            {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : claimed ? <Wrench data-icon="inline-start" aria-hidden="true" /> : <Coins data-icon="inline-start" aria-hidden="true" />}
            {busy ? "Mengklaim bonus…" : claimed ? "Upgrade mobilku" : "Klaim bonus gratis"}
            {!busy && <ArrowRight data-icon="inline-end" aria-hidden="true" />}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {claimed ? "Lanjut balapan" : "Nanti saja"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
