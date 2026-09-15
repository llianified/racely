"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { CarFront, Check, LoaderCircle, Lock, Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CAR_CATALOG, CAR_MODEL_IDS, carReferralRequirement, isCarColor, isReferralCar, switchableCars, type CarModelId } from "@/lib/car-catalog";
import type { GameState } from "@/lib/game";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status"><CarFront aria-hidden="true" /><strong>Menyiapkan mobil 3D…</strong></div>,
});

export function CarSwitchSheet({ game, active, disabled, onSelectCar, onPreviewSheet }: {
  game: GameState;
  active: boolean;
  disabled: boolean;
  onSelectCar: (model: CarModelId) => Promise<boolean>;
  onPreviewSheet: (open: boolean) => void;
}) {
  const currentModel = game.carSelection?.model ?? "neo-falcon";
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<CarModelId>(currentModel);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const saveLock = useRef(false);
  const available = switchableCars(game.carSelection?.starterModel ?? null, game.referral.completed);
  const choices = CAR_MODEL_IDS.filter(id => id === currentModel || available.includes(id) || isReferralCar(id));
  const car = CAR_CATALOG[model];
  const current = model === currentModel;
  const locked = !available.includes(model);
  const requiredFriends = carReferralRequirement(model);
  const busy = disabled || saving;
  const color = current || isCarColor(model, game.color) ? game.color : car.defaultColor;

  // Panggung garasi melepas context-nya selama sheet memakai preview 3D sendiri.
  useEffect(() => {
    if (!open || !active) return;
    onPreviewSheet(true);
    return () => onPreviewSheet(false);
  }, [open, active, onPreviewSheet]);

  const changeOpen = (value: boolean) => {
    if (saveLock.current) return;
    if (value) {
      setModel(currentModel);
      setFailed(false);
    }
    setOpen(value);
  };

  const selectCar = async () => {
    if (saveLock.current || busy || locked || current) return;
    saveLock.current = true;
    setSaving(true);
    setFailed(false);
    try {
      if (await onSelectCar(model)) setOpen(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet open={open && active} onOpenChange={changeOpen}>
      <SheetTrigger render={<Button variant="secondary" size="sm" className="garage-car-trigger" disabled={disabled} />}>
        <Repeat2 data-icon="inline-start" aria-hidden="true" />Ganti mobil
      </SheetTrigger>
      <SheetContent side="bottom" className="game-sheet" showCloseButton={!saving}>
        <SheetHeader>
          <SheetTitle>Ganti mobil</SheetTitle>
          <SheetDescription>Lihat dulu mobil pilihanmu. Progres, koin, dan koleksi tetap aman.</SheetDescription>
        </SheetHeader>
        <div className="sheet-body" data-flush>
          <div className="h-(--stage-inspect-h) bg-background" role="img" aria-label={`Preview ${car.name}. Geser untuk memutar mobil 3D.`}>
            {open && active && <CarPreviewScene model={model} color={color} levels={game.levels} equipped={game.bodyParts?.equipped} roller={game.setup?.roller} />}
          </div>
          <div className="flex flex-col gap-sm border-y border-border p-md" aria-live="polite" aria-atomic="true">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <h3 className="text-lead font-bold">{car.name}</h3>
              <Badge variant="secondary">{current ? "Sedang dipakai" : locked ? "Terkunci" : "Terbuka"}</Badge>
            </div>
            <p className="text-small text-muted-foreground">{car.chassis} · {car.description}</p>
            {locked && requiredFriends !== null && <p className="flex items-center gap-sm text-small text-muted-foreground"><Lock className="size-(--icon-sm) shrink-0" aria-hidden="true" />Ajak {Math.max(0, requiredFriends - game.referral.completed)} teman lagi untuk membuka mobil ini.</p>}
          </div>
          <ToggleGroup
            className="car-model-options flex-wrap p-md"
            aria-label="Pilihan mobil untuk dipratinjau"
            value={[model]}
            disabled={busy}
            onValueChange={(values) => {
              const next = choices.find(id => id === values[0]);
              if (!next) return;
              setModel(next);
              setFailed(false);
            }}
          >
            {choices.map(id => (
              <Toggle key={id} value={id} className="car-model-option basis-(--parts-choice-w)" aria-label={`Pratinjau ${CAR_CATALOG[id].name}`}>
                <span className="flex min-w-0 flex-col items-start gap-xs py-sm">
                  <span>{CAR_CATALOG[id].name}</span>
                  <span className="text-small font-normal text-muted-foreground">{id === currentModel ? "Sedang dipakai" : available.includes(id) ? "Siap dipakai" : `Terbuka setelah ${carReferralRequirement(id)} teman`}</span>
                </span>
                <Check className="selection-check size-(--icon-base)" aria-hidden="true" />
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
        <SheetFooter>
          {failed && <p role="alert">Belum tersimpan. Pilihanmu tetap di sini; coba lagi.</p>}
          <Button variant="gold" className="w-full" disabled={busy || current || locked} onClick={() => void selectCar()}>
            {saving ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : locked ? <Lock data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
            {saving ? "Menyimpan pilihan…" : current ? "Sedang dipakai" : locked ? "Mobil masih terkunci" : `Pakai ${car.name}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
