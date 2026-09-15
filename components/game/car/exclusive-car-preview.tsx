"use client";

import dynamic from "next/dynamic";
import { CarFront, Check, Gem, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CAR_CATALOG, type CarModelId } from "@/lib/car-catalog";
import type { GameState } from "@/lib/game";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status"><CarFront aria-hidden="true" /><strong>Menyiapkan mobil 3D…</strong></div>,
});

export function ExclusiveCarPreview({ model, locked, active = true, compact = false, color, levels, equipped, roller }: {
  model: CarModelId;
  locked: boolean;
  active?: boolean;
  compact?: boolean;
  color?: string;
  levels?: GameState["levels"];
  equipped?: NonNullable<GameState["bodyParts"]>["equipped"];
  roller?: NonNullable<GameState["setup"]>["roller"];
}) {
  const car = CAR_CATALOG[model];
  return (
    <div className="exclusive-car-preview" data-compact={compact || undefined}>
      <div className="exclusive-car-topline">
        <Badge variant="exclusive"><Gem data-icon="inline-start" aria-hidden="true" />Eksklusif</Badge>
        <span>Fable · X-Spec</span>
      </div>
      <div className="exclusive-car-stage" role="group" aria-label={`Preview eksklusif ${car.name}${locked ? ", terkunci" : ""}. Geser untuk memutar mobil 3D.`}>
        {active && <CarPreviewScene model={model} color={color ?? car.defaultColor} levels={levels} equipped={equipped} roller={roller} />}
      </div>
      <div className="exclusive-car-caption">
        <span>{locked ? <LockKeyhole aria-hidden="true" /> : <Check aria-hidden="true" />}{locked ? "Terkunci, tetap bisa dilihat" : "Koleksi eksklusif terbuka"}</span>
        <span>Tidak dijual</span>
      </div>
    </div>
  );
}
