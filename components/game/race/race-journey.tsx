"use client";

import { useEffect, useReducer, useRef } from "react";
import { ArrowRight, Check, Flag, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { coins, type GameState } from "@/lib/game";
import { createRaceStint, nextRaceGoal, raceStintReducer, STINT_LAPS, type RaceNextAction } from "@/lib/race-journey";

export function RaceJourney({ game, confirmed, disabled, onAction }: {
  game: GameState;
  confirmed: GameState;
  disabled: boolean;
  onAction: (action: RaceNextAction) => void;
}) {
  const [stint, dispatch] = useReducer(raceStintReducer, confirmed, createRaceStint);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { dispatch({ type: "confirm", confirmed }); }, [confirmed]);
  const completed = Math.min(STINT_LAPS, Math.max(0, game.laps - stint.start.laps));
  const waiting = completed >= STINT_LAPS && !stint.result;
  const progress = Math.min(waiting ? 99 : 100, Math.max(0, (game.laps - stint.start.laps + game.progress) / STINT_LAPS * 100));
  const goal = nextRaceGoal(confirmed);

  return (
    <div className="border-b border-border bg-background p-3 text-read leading-relaxed text-foreground">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">Etape {stint.number} · {STINT_LAPS} putaran</h3>
          <span className="shrink-0 text-muted-foreground">{stint.result ? "Selesai" : `${completed}/${STINT_LAPS}`}</span>
        </div>
        {stint.result ? <>
          <div role="status" className="flex flex-col gap-1">
            <strong className="flex items-center gap-2 text-lg text-accent"><Check className="size-5" aria-hidden="true" />+{coins(stint.result.coins)} dari balapan</strong>
            <p className="text-muted-foreground leading-relaxed">Hasil {stint.result.laps} putaran sejak etape dimulai, terkonfirmasi. Termasuk dalam hasil balapanmu.</p>
          </div>
          <Button variant="gold" className="w-full" onClick={() => {
            dispatch({ type: "continue", confirmed });
            heading.current?.focus({ preventScroll: true });
          }}>
            Lanjut {STINT_LAPS} putaran<ArrowRight data-icon="inline-end" />
          </Button>
          <p className="text-muted-foreground">Mobil tetap jalan. Tidak perlu klaim untuk lanjut.</p>
        </> : <>
          <Progress value={progress} aria-label={`Etape ${stint.number}, target ${STINT_LAPS} putaran`} />
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            {waiting ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <Flag className="size-4 shrink-0" aria-hidden="true" />}
            {waiting ? "Menunggu konfirmasi hasil…" : "Otomatis berjalan · Gaspol untuk lebih cepat."}
          </p>
        </>}
        <div className="border-t border-border pt-2">
          <div className="flex flex-col gap-2">
            <p className="text-pretty"><strong>{goal.title}</strong>{stint.result && <span className="block text-muted-foreground leading-relaxed">{goal.detail}</span>}</p>
            {goal.progress && stint.result && <Progress value={goal.progress.value / goal.progress.target * 100} aria-label={goal.title} />}
            {goal.action && <Button variant="outline" className="w-full" disabled={disabled} onClick={() => onAction(goal.action!)}>{goal.label}<ArrowRight data-icon="inline-end" /></Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
