"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, Flag, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CAR_CATALOG, CAR_MODEL_IDS, isCarColor, type CarColor, type CarModelId } from "@/lib/car-catalog";
import { CarColorPicker } from "./car-color-picker";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), { ssr: false });

export function CarSelection({ developmentPreview, returningPlayer, initialColor, saving, onConfirm }: {
  developmentPreview: boolean;
  returningPlayer: boolean;
  initialColor: string;
  saving: boolean;
  onConfirm: (model: CarModelId, color: CarColor) => Promise<boolean>;
}) {
  const [model, setModel] = useState<CarModelId>("neo-falcon");
  const [color, setColor] = useState<CarColor>(isCarColor("neo-falcon", initialColor) ? initialColor : CAR_CATALOG["neo-falcon"].defaultColor);
  const [failed, setFailed] = useState(false);
  const car = CAR_CATALOG[model];
  const colorName = car.colors.find((choice) => choice.color === color)?.name;

  return (
    <main className="car-selection font-sans" aria-busy={saving}>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="brand-word">RACELY</span>
          {developmentPreview && <Badge variant="secondary">Mode development</Badge>}
        </div>
        <div>
          <h1 className="text-balance">{returningPlayer ? "Pilih mobilmu" : "Pilih mobil pertamamu"}</h1>
          <p className="text-muted-foreground">
            Model hanya dipilih sekali. Warna bisa diganti di garasi.
            {returningPlayer && " Koin, upgrade, dan progresmu tetap aman."}
          </p>
        </div>
      </header>
      <ToggleGroup
        className="car-model-options"
        aria-label="Model mobil"
        value={[model]}
        disabled={saving}
        onValueChange={(values) => {
          const next = CAR_MODEL_IDS.find((id) => id === values[0]);
          if (!next) return;
          setModel(next);
          setColor(CAR_CATALOG[next].defaultColor);
          setFailed(false);
        }}
      >
        {CAR_MODEL_IDS.map((id) => (
          <Toggle key={id} value={id} className="car-model-option">
            <span>{CAR_CATALOG[id].name}</span>
            <Check className="selection-check size-4" aria-hidden="true" />
          </Toggle>
        ))}
      </ToggleGroup>
      <section className="panel selection-showcase" aria-label={`Preview ${car.name}`}>
        <div className="selection-stage" role="img" aria-label={`${car.name}, warna ${colorName}, model 3D berputar`}>
          <CarPreviewScene model={model} color={color} />
        </div>
        <div className="selection-details">
          <div className="flex items-center justify-between">
            <h2>{car.name}</h2>
            <Badge variant="secondary">Gratis</Badge>
          </div>
          <p className="text-muted-foreground">{car.description}</p>
          <CarColorPicker model={model} color={color} disabled={saving} onChoose={(next) => setColor(next)} />
        </div>
      </section>
      <footer className="flex flex-col gap-3">
        {failed && <p role="alert">Belum tersimpan. Pilihanmu tetap di sini; coba lagi.</p>}
        <Button
          variant="gold"
          size="lg"
          disabled={saving}
          onClick={async () => {
            setFailed(false);
            if (!await onConfirm(model, color)) setFailed(true);
          }}
        >
          {saving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Flag data-icon="inline-start" />}
          {saving ? "Menyimpan pilihan…" : `Pilih ${car.name} & mulai`}
        </Button>
        <p className="text-center text-muted-foreground">
          {developmentPreview
            ? "Mode development menyimpan progres secara lokal di browser ini."
            : "Pilihan tersimpan aman ke akun Telegram kamu."}
        </p>
      </footer>
    </main>
  );
}
