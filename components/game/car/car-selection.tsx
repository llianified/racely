"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { ArrowLeft, ArrowRight, Check, Flag, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CAR_CATALOG, CAR_MODEL_IDS, isCarColor, type CarColor, type CarModelId } from "@/lib/car-catalog";
import { CarColorPicker } from "./car-color-picker";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      <strong>Menyiapkan mobil 3D…</strong>
    </div>
  ),
});

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
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const submitLock = useRef(false);
  const busy = saving || submitting;

  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus({ preventScroll: true });
      previousStep.current = step;
    }
  }, [step]);

  const confirmSelection = async () => {
    if (saving || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      if (!await onConfirm(model, color)) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const car = CAR_CATALOG[model];
  const colorName = car.colors.find((choice) => choice.color === color)?.name;

  return (
    <main className="car-selection font-sans" aria-busy={busy}>
      <header className="selection-header">
        <div className="selection-topline">
          <div className="selection-brand">
            <Image src="/racely-logo.png" alt="" width={372} height={248} sizes="36px" className="selection-logo" />
            <span>RACELY<span className="selection-brand-dot" aria-hidden="true">.</span></span>
          </div>
          {developmentPreview ? <Badge variant="secondary" className="selection-edition">Development</Badge> : <span className="selection-edition">START YOUR STORY</span>}
        </div>
        <ol className="selection-steps" aria-label="Langkah onboarding">
          <li aria-current={step === 1 ? "step" : undefined} data-complete={step === 2 || undefined}>
            <span><span className="selection-step-number">{step === 2 ? <Check className="size-(--icon-base)" aria-label="Selesai" /> : "01"}</span> Pilih mobil</span>
          </li>
          <li aria-current={step === 2 ? "step" : undefined}>
            <span><span className="selection-step-number">02</span> Sentuhanmu</span>
          </li>
        </ol>
        <div className="selection-intro">
          <h1 ref={headingRef} tabIndex={-1}>
            {step === 1 ? <>{returningPlayer ? "Kembali ke garasi." : "Mobil pertamamu."}<br /><span>Awal cerita baru.</span></> : <>Pilih warnanya.<br /><span>Tunjukkan gayamu.</span></>}
          </h1>
          <p>{step === 1
            ? returningPlayer
              ? "Koin, upgrade, dan progresmu tetap aman. Model hanya dipilih sekali."
              : `Dua karakter. Satu pilihan. Mana jagoanmu? Model hanya dipilih sekali.${developmentPreview ? " Progres preview disimpan di browser ini." : ""}`
            : "Sentuhan terakhir sebelum turun ke lintasan. Model tetap, warna bisa diganti."}</p>
        </div>
      </header>

      <section className="selection-showcase" aria-label={`Preview ${car.name}`}>
        <div className="selection-specs">
          <span>{car.chassis}</span>
          <Badge variant="outline">Gratis</Badge>
        </div>
        <div className="selection-stage" role="img" aria-label={`${car.name}, warna ${colorName}. Geser untuk memutar mobil 3D.`}>
          <CarPreviewScene model={model} color={color} />
        </div>
        <div className="selection-details" aria-live="polite" aria-atomic="true">
          <h2>{car.name}</h2>
          <p>{step === 1 ? car.description : colorName}</p>
        </div>
      </section>

      <div className="selection-controls">
        {step === 1 ? (
          <ToggleGroup
            className="car-model-options"
            aria-label="Model mobil"
            value={[model]}
            disabled={busy}
            onValueChange={(values) => {
              const next = CAR_MODEL_IDS.find((id) => id === values[0]);
              if (!next || next === model) return;
              setModel(next);
              setColor(CAR_CATALOG[next].defaultColor);
              setFailed(false);
            }}
          >
            {CAR_MODEL_IDS.map((id) => (
              <Toggle key={id} value={id} className="car-model-option">
                <span>{CAR_CATALOG[id].name}</span>
                <Check className="selection-check size-(--icon-base)" aria-hidden="true" />
              </Toggle>
            ))}
          </ToggleGroup>
        ) : (
          <CarColorPicker model={model} color={color} disabled={busy} onChoose={(next) => { setColor(next); setFailed(false); }} />
        )}
      </div>

      <footer className="selection-footer">
        {failed && <p role="alert">Belum tersimpan. Pilihanmu tetap di sini; coba lagi.</p>}
        <div className="selection-actions">
          {step === 2 && (
            <Button variant="outline" size="icon-lg" className="press-button" aria-label="Kembali ke pilihan mobil" disabled={busy} onClick={() => { setStep(1); setFailed(false); }}>
              <ArrowLeft aria-hidden="true" />
            </Button>
          )}
          <Button variant="gold" size="lg" className="flex-1" disabled={busy} onClick={step === 1 ? () => setStep(2) : confirmSelection}>
            {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : step === 2 ? <Flag data-icon="inline-start" /> : null}
            {busy ? "Menyimpan pilihan…" : step === 1 ? "Lanjut, pilih warna" : "Simpan & mulai balapan"}
            {step === 1 && <ArrowRight data-icon="inline-end" />}
          </Button>
        </div>
      </footer>
    </main>
  );
}
