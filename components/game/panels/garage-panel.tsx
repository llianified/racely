"use client";

import dynamic from "next/dynamic";
import { memo, useRef, useState } from "react";
import { ArrowUp, BatteryMedium, CarFront, Check, Cog, CircleDot, LoaderCircle, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CAR_CATALOG, type CarColor } from "@/lib/car-catalog";
import { CarColorPicker } from "../car/car-color-picker";
import { SectionCardHeading } from "../shell/section-card-heading";
import { InfoHint } from "./info-hint";
import { BodyPartsShop } from "./body-parts-shop";
import type { PartCommand } from "@/lib/car-parts";
import { gripTuning, powertrainTuning } from "@/lib/race-dynamics";
import { coins, displaySpeedKmh, formatCoins, formatSpeedKmh, lapReward, lapSeconds, modificationPreview, totalLevel, type GameState, type Upgrade } from "@/lib/game";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <CarFront aria-hidden="true" />
      <strong>Menyiapkan mobil 3D…</strong>
    </div>
  ),
});

export const PARTS = [
  { key: "engine" as Upgrade, title: "Mesin", subtitle: "+15% tenaga dasar", icon: Cog },
  // Grip sengaja tidak disebut di sini: simulasinya menggerakkan racing line,
  // bukan koin atau lap server, jadi menjualnya di baris keputusan pembelian
  // menjanjikan penghasilan yang tidak akan datang. Rinciannya tetap ada di
  // tabel grip dalam lembar modifikasi, lengkap dengan batasannya.
  { key: "tires" as Upgrade, title: "Ban & roller", subtitle: "+10% tenaga dasar", icon: CircleDot },
  { key: "battery" as Upgrade, title: "Baterai", subtitle: "+0,01 koin / putaran", icon: BatteryMedium },
];

export const BODY_COLORS = CAR_CATALOG["neo-falcon"].colors;

export const GaragePanel = memo(function GaragePanel({
  game,
  active = true,
  onChooseColor,
  onPartAction,
  disabled = false,
}: {
  game: GameState;
  active?: boolean;
  onChooseColor: (color: CarColor, name: string) => void;
  onPartAction: (action: PartCommand) => Promise<boolean>;
  disabled?: boolean;
}) {
  const model = game.carSelection?.model ?? "neo-falcon";
  const car = CAR_CATALOG[model];
  const colorName = car.colors.find((choice) => choice.color === game.color)?.name ?? "pilihan";
  return (
    <>
      <section id="body-colors" tabIndex={-1} className="panel garage-panel" aria-label="Mobil kamu">
        <div className="car-stage" role="img" aria-label={`${car.name} warna ${colorName}, model 3D yang sama dengan di lintasan. Geser untuk memutar.`}>
          <CarPreviewScene color={game.color} model={model} levels={game.levels} equipped={game.bodyParts?.equipped} active={active} />
        </div>
        <div className="car-identity">
          <div className="car-identity-head">
            <div className="car-identity-heading">
              <div className="car-identity-title">
                <h2>{car.name}</h2>
                <Badge variant="secondary" className="car-level-chip">Lv. {totalLevel(game)}</Badge>
              </div>
              <div className="heading-aside">
                <InfoHint title="Mobil kamu">Kecepatan dasar tanpa boost. Model 3D ini sama dengan mobil di lintasan. Ganti warna bodi gratis dan langsung aktif.</InfoHint>
              </div>
            </div>
            <p>{car.chassis}</p>
            <p>{car.description}</p>
          </div>
        </div>
        <CarColorPicker model={model} color={game.color} disabled={disabled} onChoose={onChooseColor} />
        <dl className="garage-stats">
          <div><dt>Kecepatan dasar</dt><dd><strong>{formatSpeedKmh(displaySpeedKmh(lapSeconds({ ...game, boostLeft: 0 })))}</strong> km/j</dd></div>
          <div><dt>Hasil per putaran</dt><dd><strong>{formatCoins(lapReward(game))}</strong> koin</dd></div>
        </dl>
      </section>
      <BodyPartsShop game={game} active={active} disabled={disabled} onAction={onPartAction} />
    </>
  );
});

type UpgradePanelProps = {
  game: GameState;
  onUpgrade: (key: Upgrade) => Promise<boolean>;
  disabled?: boolean;
};

const seconds = (value: number) => value.toLocaleString("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function ModificationSlot({ game, onUpgrade, disabled, part }: UpgradePanelProps & { part: (typeof PARTS)[number] }) {
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showAfter, setShowAfter] = useState(true);
  const [inspect, setInspect] = useState(false);
  const installLock = useRef(false);
  const { key, title, icon: Icon } = part;
  const preview = modificationPreview(game, key);
  const { level, nextLevel, maxed, cost, shortfall } = preview;
  const currentGrip = gripTuning(game.levels.tires);
  const nextGrip = gripTuning(key === "tires" ? nextLevel : game.levels.tires);
  const currentPowertrain = powertrainTuning(game.levels.engine, game.levels.battery);
  const nextPowertrain = powertrainTuning(key === "engine" ? nextLevel : game.levels.engine, key === "battery" ? nextLevel : game.levels.battery);
  const blocked = disabled || installing;
  const benefit = key === "battery"
    ? `+${formatCoins(preview.afterReward - preview.beforeReward)} koin / putaran`
    : `${seconds(preview.beforeSeconds - preview.afterSeconds)} dtk lebih cepat / putaran`;

  const install = async () => {
    if (installLock.current || blocked || maxed || shortfall > 0) return;
    installLock.current = true;
    setInstalling(true);
    try {
      if (await onUpgrade(key)) setOpen(false);
    } finally {
      installLock.current = false;
      setInstalling(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => { if (!installLock.current) setOpen(value); }}>
      <div className="upgrade-row">
        <div className="upgrade-info">
          <div className="upgrade-name"><Icon size={16} aria-hidden="true" /><h3>{title}</h3><span className="level-label">Lv. {level}</span></div>
          <p>{preview.currentPart} · Terpasang</p>
          <p>{maxed ? "Modifikasi maksimal" : benefit}</p>
          {key === "engine" && <div className="upgrade-arena-info">
            <p><strong>Akselerasi arena</strong></p>
            <p>Respons 90%: {seconds(Math.log(10) / currentPowertrain.accelerationRate)} d{!maxed && ` → ${seconds(Math.log(10) / nextPowertrain.accelerationRate)} d`}</p>
            <p>Lebih kecil = lebih cepat pulih setelah tikungan.</p>
          </div>}
          {key === "tires" && <p>Grip · pengurasan −{currentGrip.drainReductionPercent}%{!maxed && ` → −${nextGrip.drainReductionPercent}%`}</p>}
          {key === "battery" && <div className="upgrade-arena-info">
            <p><strong>Energi boost arena</strong></p>
            <p>Cadangan: {seconds(currentPowertrain.boostCapacitySeconds)} d{!maxed && ` → ${seconds(nextPowertrain.boostCapacitySeconds)} d`}</p>
            <p>Terisi penuh dalam {currentPowertrain.rechargeSeconds} d tanpa Gaspol.</p>
          </div>}
          <div className="level-segments" aria-label={`Level ${level} dari 10`}>
            {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < level ? "filled" : undefined} />)}
          </div>
        </div>
        <div className="upgrade-action">
          <SheetTrigger render={<Button variant="gold" className="upgrade-buy" disabled={blocked || maxed} />} aria-label={maxed ? `${title} level maksimal` : `Modifikasi ${title}`}>
            {maxed ? <Check data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
            {maxed ? "MAX" : "Modif"}
          </SheetTrigger>
        </div>
      </div>
      <SheetContent side="bottom" className="game-sheet gap-0 p-0 font-sans" showCloseButton={!installing}>
        <SheetHeader className="border-b border-border px-md py-md pr-(--space-56)">
          <SheetTitle>Modifikasi {title.toLowerCase()}</SheetTitle>
          <SheetDescription>Pilih peningkatan permanen untuk mobilmu. Koin hanya dipotong setelah pemasangan berhasil.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col text-base leading-relaxed">
          <div className="flex items-center gap-md border-b border-border bg-background px-md py-md text-foreground">
            <Icon className="size-(--icon-xl) shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-bold">{preview.nextPart}</p>
              <p className="text-muted-foreground">Level {level} → {nextLevel} · {part.subtitle}</p>
            </div>
          </div>
          <div className="border-b border-border bg-background px-md py-md text-foreground">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="h-(--stage-inspect-h)" role="img" aria-label={`${showAfter ? "Setelah" : "Sebelum"} modifikasi ${title}, level ${showAfter ? nextLevel : level}${inspect ? ", bodi dilepas" : ""}. Geser untuk memutar.`}>
                {open && <CarPreviewScene color={game.color} equipped={game.bodyParts?.equipped} model={game.carSelection?.model ?? "neo-falcon"} levels={showAfter ? { ...game.levels, [key]: nextLevel } : game.levels} inspect={inspect} />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-sm border-t border-border p-md">
                <span aria-live="polite">{showAfter ? "Setelah" : "Sebelum"} · Lv. {showAfter ? nextLevel : level}</span>
                <div className="flex flex-wrap gap-sm">
                  <Button variant="outline" size="sm" onClick={() => setShowAfter(value => !value)} aria-pressed={showAfter}>{showAfter ? "Lihat sebelum" : "Lihat setelah"}</Button>
                  <Button variant="outline" size="sm" onClick={() => setInspect(value => !value)} aria-pressed={inspect}>{inspect ? "Pasang bodi" : "Lepas bodi"}</Button>
                </div>
              </div>
            </div>
          </div>
          <p className="border-b border-border px-md py-md text-muted-foreground">{key === "engine"
            ? "Visual: sirip heatsink bertambah setiap level. Di arena, mesin mempercepat akselerasi setelah tikungan atau kecelakaan; bodi mendongak ringan dan putaran roda serta RPM mengikuti tenaga aktual."
            : key === "tires"
              ? "Visual: ban lebih lebar, cincin velg emas, dan roller bertingkat."
              : "Visual: strip emas dudukan baterai bertambah setiap level. Di arena, cadangan boost bertahan lebih lama dan lampu indikator meredup ketika energi menipis. Lepas bodi untuk melihat detail sel."}</p>
          <table className="w-full text-left tabular-nums">
            <caption className="px-md pt-md pb-sm text-left font-semibold">Simulasi performa tanpa boost</caption>
            <thead className="text-muted-foreground">
              <tr><th scope="col" className="px-md pb-sm font-normal">Performa</th><th scope="col" className="pb-sm text-right font-normal">Saat ini</th><th scope="col" className="px-md pb-sm text-right font-normal">Setelah</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-border"><th scope="row" className="px-md py-sm font-normal">Detik / putaran</th><td className="text-right">{seconds(preview.beforeSeconds)}</td><td className="px-md text-right font-bold text-accent">{seconds(preview.afterSeconds)}</td></tr>
              <tr className="border-y border-border"><th scope="row" className="px-md py-sm font-normal">Koin / putaran</th><td className="text-right">{formatCoins(preview.beforeReward)}</td><td className="px-md text-right font-bold text-accent">{formatCoins(preview.afterReward)}</td></tr>
            </tbody>
          </table>
          {key !== "tires" && <>
            <table className="w-full text-left tabular-nums">
              <caption className="px-md pt-md pb-sm text-left font-semibold">Simulasi arena · {key === "engine" ? "akselerasi" : "energi boost"}</caption>
              <thead className="text-muted-foreground">
                <tr><th scope="col" className="px-md pb-sm font-normal">Performa</th><th scope="col" className="pb-sm text-right font-normal">Saat ini</th><th scope="col" className="px-md pb-sm text-right font-normal">Setelah</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <th scope="row" className="px-md py-sm font-normal">{key === "engine" ? "Respons 90% · detik" : "Cadangan boost · detik"}</th>
                  <td className="text-right">{seconds(key === "engine" ? Math.log(10) / currentPowertrain.accelerationRate : currentPowertrain.boostCapacitySeconds)}</td>
                  <td className="px-md text-right font-bold text-accent">{seconds(key === "engine" ? Math.log(10) / nextPowertrain.accelerationRate : nextPowertrain.boostCapacitySeconds)}</td>
                </tr>
              </tbody>
            </table>
            <p className="border-y border-border px-md py-md text-muted-foreground">{key === "engine"
              ? "Waktu mencapai 90% kecepatan target di lintasan lurus; lebih kecil berarti lebih responsif. RPM dan gerak bodi mengikuti akselerasi, bukan sekadar level."
              : `Cadangan dari energi penuh, bukan tambahan durasi Gaspol. Dorongan melemah menjelang habis, tertahan saat keluar lintasan, dan terisi penuh dalam ${currentPowertrain.rechargeSeconds} detik tanpa Gaspol.`} Efek arena tidak mengubah lap, koin, baterai idle, atau timer Gaspol server.</p>
          </>}
          {key === "tires" && <>
            <table className="w-full text-left tabular-nums">
              <caption className="px-md pt-md pb-sm text-left font-semibold">Grip tikungan · poin/detik</caption>
              <thead className="text-muted-foreground">
                <tr><th scope="col" className="px-md pb-sm font-normal">Kondisi</th><th scope="col" className="pb-sm text-right font-normal">Saat ini</th><th scope="col" className="px-md pb-sm text-right font-normal">Setelah</th></tr>
              </thead>
              <tbody>
                {[
                  { label: "Terkuras · normal", before: currentGrip.cornerDrain, after: nextGrip.cornerDrain },
                  { label: "Terkuras · boost", before: currentGrip.boostedCornerDrain, after: nextGrip.boostedCornerDrain },
                  { label: "Pulih · lurus", before: currentGrip.straightRecovery, after: nextGrip.straightRecovery },
                ].map(row => <tr key={row.label} className="border-t border-border">
                  <th scope="row" className="px-md py-sm font-normal">{row.label}</th>
                  <td className="text-right">{formatCoins(row.before)}</td>
                  <td className="px-md text-right font-bold text-accent">{formatCoins(row.after)}</td>
                </tr>)}
              </tbody>
            </table>
            <p className="border-y border-border px-md py-md text-muted-foreground">Pengurasan lebih kecil, pemulihan lebih cepat. Pengurangan dihitung dari ban level 1, hingga 54% di level 10. Boost tetap berisiko selip. Efek grip hanya saat simulasi aktif; tidak mengubah koin atau lap server.</p>
          </>}
          <dl className="flex flex-col gap-sm border-b border-border px-md py-md">
            <div className="flex justify-between gap-md"><dt>Biaya pemasangan</dt><dd className="font-bold">{coins(cost)}</dd></div>
            <div className="flex justify-between gap-md text-muted-foreground"><dt>Saldo saat ini</dt><dd>{coins(game.balance)}</dd></div>
            {shortfall === 0 && <div className="flex justify-between gap-md text-muted-foreground"><dt>Sisa saldo</dt><dd>{coins(game.balance - cost)}</dd></div>}
          </dl>
          <p role="status" className="px-md py-md text-muted-foreground">
            {shortfall > 0
              ? `Kurang ${coins(shortfall)}. Klaim hasil balapan atau hadiah terlebih dahulu.`
              : "Part dan tampilan 3D berubah otomatis setelah pemasangan berhasil, di garasi maupun lintasan. Part tidak bisa dijual kembali."}
          </p>
        </div>
        <SheetFooter className="border-t border-border px-md py-md">
          <SheetClose render={<Button variant="outline" disabled={installing} />}>Batal</SheetClose>
          <Button variant="gold" disabled={blocked || maxed || shortfall > 0} onClick={() => void install()} aria-busy={installing}>
            {installing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
            {installing ? "Memasang…" : maxed ? "Level maksimal" : `Pasang · ${coins(cost)}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UpgradePanel({ game, onUpgrade, disabled = false }: UpgradePanelProps) {
  return (
    <section id="upgrades" tabIndex={-1} className="panel upgrade-panel" aria-label="Bengkel modifikasi">
      <SectionCardHeading
        icon={Wrench}
        title="Bengkel"
        aside={
          <InfoHint title="Modifikasi mobil">Pilih part, cek perubahan performa, lalu konfirmasi pemasangan. Mesin dan ban mempercepat putaran; baterai menambah hasil koin. Di simulasi arena, mesin mempercepat akselerasi, ban memperkuat grip, dan baterai memperpanjang cadangan boost tanpa mengubah timer Gaspol server. Setiap pemasangan menaikkan satu level, maksimal level 10.</InfoHint>
        }
      />
      <p className="upgrade-arena-note">Info arena di bawah hanya untuk simulasi gerak. Tidak menambah koin, durasi Gaspol, atau baterai idle server.</p>
      <div className="upgrade-list">
        {PARTS.map((part) => <ModificationSlot key={part.key} part={part} game={game} onUpgrade={onUpgrade} disabled={disabled} />)}
      </div>
    </section>
  );
}
