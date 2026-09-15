"use client";

import dynamic from "next/dynamic";
import { memo, useEffect, useRef, useState } from "react";
import { ArrowUp, BatteryMedium, CarFront, Check, Cog, CircleDot, LoaderCircle, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CAR_CATALOG, type CarColor, type CarModelId } from "@/lib/car-catalog";
import { CarColorPicker } from "../car/car-color-picker";
import { CarSwitchSheet } from "../car/car-switch-sheet";
import { SectionCardHeading } from "../shell/section-card-heading";
import { BodyPartsShop } from "./body-parts-shop";
import { PaintCollection } from "./paint-collection";
import { PAINT_CATALOG, PAINT_IDS, type PaintCommand } from "@/lib/car-paints";
import type { PartCommand } from "@/lib/car-parts";
import { gripTuning, powertrainTuning } from "@/lib/race-dynamics";
import { cn } from "@/lib/utils";
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

/** Laju per level datang dari config, jadi "+15%" tidak boleh ditulis lepas. */
const percent = (rate: number) =>
  `${(rate * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

export const PARTS = [
  {
    key: "engine" as Upgrade,
    title: "Mesin",
    subtitle: (e: GameState["economy"]) => `+${percent(e.lapEnginePerLevel)} tenaga dasar`,
    icon: Cog,
  },
  // Grip sengaja tidak disebut di sini: simulasinya menggerakkan racing line,
  // bukan koin atau lap server, jadi menjualnya di baris keputusan pembelian
  // menjanjikan penghasilan yang tidak akan datang. Rinciannya tetap ada di
  // tabel grip dalam lembar modifikasi, lengkap dengan batasannya.
  {
    key: "tires" as Upgrade,
    title: "Ban & roller",
    subtitle: (e: GameState["economy"]) => `+${percent(e.lapTiresPerLevel)} tenaga dasar`,
    icon: CircleDot,
  },
  {
    key: "battery" as Upgrade,
    title: "Baterai",
    subtitle: (e: GameState["economy"]) =>
      `+${formatCoins(e.lapRewardPerBattery)} koin / putaran`,
    icon: BatteryMedium,
  },
];

export const BODY_COLORS = CAR_CATALOG["neo-falcon"].colors;

export const GaragePanel = memo(function GaragePanel({
  game,
  active = true,
  previewSheetOpen = false,
  onPreviewSheet,
  onChooseColor,
  onPartAction,
  onPaintAction,
  onSelectCar,
  onOpenReferral,
  disabled = false,
}: {
  game: GameState;
  active?: boolean;
  /** Sebuah sheet dengan panggung 3D-nya sendiri sedang menutupi panggung ini. */
  previewSheetOpen?: boolean;
  onPreviewSheet: (open: boolean) => void;
  onChooseColor: (color: CarColor, name: string) => void;
  onPartAction: (action: PartCommand) => Promise<boolean>;
  onPaintAction: (action: PaintCommand) => Promise<boolean>;
  onSelectCar: (model: CarModelId) => Promise<boolean>;
  onOpenReferral: () => void;
  disabled?: boolean;
}) {
  const model = game.carSelection?.model ?? "neo-falcon";
  const car = CAR_CATALOG[model];
  const colorName = car.colors.find((choice) => choice.color === game.color)?.name ?? PAINT_IDS.map(id => PAINT_CATALOG[id]).find(paint => paint.color === game.color)?.name ?? "pilihan";
  return (
    <>
      <section id="body-colors" tabIndex={-1} className="panel garage-panel" aria-label="Mobil kamu">
        <div className="car-stage" role="group" aria-label="Preview mobil garasi">
          <div role="img" aria-label={`${car.name} warna ${colorName}, model 3D yang sama dengan di lintasan. Geser untuk memutar.`}>
            <CarPreviewScene roller={game.setup?.roller} color={game.color} model={model} levels={game.levels} equipped={game.bodyParts?.equipped} active={active && !previewSheetOpen} standbyHint={previewSheetOpen ? "Tutup lembar yang terbuka untuk menyalakannya lagi." : undefined} />
          </div>
          <CarSwitchSheet game={game} active={active} disabled={disabled} onSelectCar={onSelectCar} onPreviewSheet={onPreviewSheet} onOpenReferral={onOpenReferral} />
        </div>
        <div className="car-identity">
          <div className="car-identity-head">
            <div className="car-identity-heading">
              <div className="car-identity-title">
                <h2>{car.name}</h2>
                <Badge variant="secondary" className="car-level-chip">Lv. {totalLevel(game)}</Badge>
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
      <BodyPartsShop game={game} active={active} disabled={disabled} onAction={onPartAction} onPreviewSheet={onPreviewSheet} />
      <PaintCollection game={game} disabled={disabled} onAction={onPaintAction} />
    </>
  );
});

type UpgradePanelProps = {
  game: GameState;
  onUpgrade: (key: Upgrade) => Promise<boolean>;
  onPreviewSheet: (open: boolean) => void;
  disabled?: boolean;
};

const seconds = (value: number) => value.toLocaleString("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function ModificationSlot({ game, onUpgrade, onPreviewSheet, disabled, part }: UpgradePanelProps & { part: (typeof PARTS)[number] }) {
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showAfter, setShowAfter] = useState(true);
  const [inspect, setInspect] = useState(false);
  const installLock = useRef(false);
  // Lembar ini membawa panggung 3D-nya sendiri. Selama terbuka, panggung garasi
  // di belakangnya harus melepas context-nya -- ia tertutup penuh dan dua
  // context hidup bersamaan adalah kondisi yang membunuh renderer WebView.
  useEffect(() => {
    if (!open) return;
    onPreviewSheet(true);
    return () => onPreviewSheet(false);
  }, [open, onPreviewSheet]);
  const { key, title, icon: Icon } = part;
  const ceiling = game.economy.maxUpgradeLevel;
  const preview = modificationPreview(game, key);
  const { level, nextLevel, maxed, cost, shortfall } = preview;
  const currentGrip = gripTuning(game.levels.tires);
  const nextGrip = gripTuning(key === "tires" ? nextLevel : game.levels.tires);
  const currentPowertrain = powertrainTuning(game.levels.engine, game.levels.battery);
  const nextPowertrain = powertrainTuning(key === "engine" ? nextLevel : game.levels.engine, key === "battery" ? nextLevel : game.levels.battery);
  const blocked = disabled || installing;
  // Satu baris metrik seperti Setup dan Koleksi cat: nama part saat ini dan
  // dampak level berikutnya per putaran (angka server). Efek arena dan
  // penjelasan panjangnya tetap ada di lembar modifikasi.
  const benefit = key === "battery"
    ? `+${formatCoins(preview.afterReward - preview.beforeReward)} koin`
    : `−${seconds(preview.beforeSeconds - preview.afterSeconds)}s`;
  const ready = !maxed && shortfall === 0;

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
      <div className={cn("upgrade-row mod-row", maxed && "is-active", ready && "is-ready")}>
        <div className="upgrade-head">
          <span className="upgrade-icon" aria-hidden="true"><Icon /></span>
          <div className="upgrade-name">
            <h3>{title}</h3>
            <p className="setup-metric" title={preview.currentPart}>
              {preview.currentPart}
            </p>
          </div>
          {maxed
            ? <Badge variant="secondary" className="upgrade-buy"><Check data-icon="inline-start" aria-hidden="true" />MAX</Badge>
            : <SheetTrigger render={<Button variant="goldSoft" size="sm" className="upgrade-buy" disabled={blocked} />} aria-label={`Modifikasi ${title}`}>
              <Wrench data-icon="inline-start" />Modif
            </SheetTrigger>}
        </div>
        <div className="upgrade-level">
          <span className="level-label">Lv. {level}</span>
          {/* Jumlah segmen mengikuti config: ceiling yang disetel jadi 5 tidak
              boleh menyisakan lima kotak yang tidak akan pernah terisi. Tapi
              ceiling juga bisa DITURUNKAN di bawah level pemain yang sudah
              jalan, dan `length: ceiling` saja lalu menampilkan "Lv. 8 dari 3"
              beserta tiga kotak -- lebih sedikit kotak daripada level yang
              sudah dibayar pemain. */}
          <div className="level-segments" aria-label={`Level ${level} dari ${Math.max(ceiling, level)}`}>
            {Array.from({ length: Math.max(ceiling, level) }, (_, i) => <span key={i} className={i < level ? "filled" : undefined} />)}
          </div>
          <p className="mod-benefit setup-metric">
            {maxed ? "Level maksimal" : <><b>{benefit}</b>/putaran</>}
          </p>
        </div>
      </div>
      <SheetContent side="bottom" className="game-sheet" showCloseButton={!installing}>
        <SheetHeader>
          <SheetTitle>Modifikasi {title.toLowerCase()}</SheetTitle>
          <SheetDescription>Peningkatan permanen. Koin hanya dipotong setelah pemasangan berhasil.</SheetDescription>
        </SheetHeader>
        <div className="sheet-body" data-flush>
          <div className="flex items-center gap-md border-b border-border bg-background px-md py-md text-foreground">
            <Icon className="size-(--icon-xl) shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-bold">{preview.nextPart}</p>
              <p className="text-muted-foreground">Level {level} → {nextLevel} · {part.subtitle(game.economy)}</p>
            </div>
          </div>
          <div className="border-b border-border bg-background px-md py-md text-foreground">
            <div className="overflow-hidden rounded-(--corner-box) border border-border">
              <div className="h-(--stage-inspect-h)" role="img" aria-label={`${showAfter ? "Setelah" : "Sebelum"} modifikasi ${title}, level ${showAfter ? nextLevel : level}${inspect ? ", bodi dilepas" : ""}. Geser untuk memutar.`}>
                {open && <CarPreviewScene roller={game.setup?.roller} color={game.color} equipped={game.bodyParts?.equipped} model={game.carSelection?.model ?? "neo-falcon"} levels={showAfter ? { ...game.levels, [key]: nextLevel } : game.levels} inspect={inspect} />}
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
              : "Baterai menambah hasil koin per putaran. Strip emas dudukan baterai bertambah setiap level. Lepas bodi untuk melihat detail sel."}</p>
          <table className="w-full text-left tabular-nums">
            <caption className="px-md pt-md pb-sm text-left font-semibold">Performa balapan otomatis</caption>
            <thead className="text-muted-foreground">
              <tr><th scope="col" className="px-md pb-sm font-normal">Performa</th><th scope="col" className="pb-sm text-right font-normal">Saat ini</th><th scope="col" className="px-md pb-sm text-right font-normal">Setelah</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-border"><th scope="row" className="px-md py-sm font-normal">Detik / putaran</th><td className="text-right">{seconds(preview.beforeSeconds)}</td><td className="px-md text-right font-bold text-accent">{seconds(preview.afterSeconds)}</td></tr>
              <tr className="border-y border-border"><th scope="row" className="px-md py-sm font-normal">Koin / putaran</th><td className="text-right">{formatCoins(preview.beforeReward)}</td><td className="px-md text-right font-bold text-accent">{formatCoins(preview.afterReward)}</td></tr>
            </tbody>
          </table>
          {key === "engine" && <>
            <table className="w-full text-left tabular-nums">
              <caption className="px-md pt-md pb-sm text-left font-semibold">Simulasi arena · akselerasi</caption>
              <thead className="text-muted-foreground">
                <tr><th scope="col" className="px-md pb-sm font-normal">Performa</th><th scope="col" className="pb-sm text-right font-normal">Saat ini</th><th scope="col" className="px-md pb-sm text-right font-normal">Setelah</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <th scope="row" className="px-md py-sm font-normal">Respons 90% · detik</th>
                  <td className="text-right">{seconds(Math.log(10) / currentPowertrain.accelerationRate)}</td>
                  <td className="px-md text-right font-bold text-accent">{seconds(Math.log(10) / nextPowertrain.accelerationRate)}</td>
                </tr>
              </tbody>
            </table>
            <p className="border-y border-border px-md py-md text-muted-foreground">Waktu mencapai 90% kecepatan target di lintasan lurus; lebih kecil berarti lebih responsif. RPM dan gerak bodi mengikuti akselerasi. Efek arena tidak mengubah lap atau koin server.</p>
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
                  { label: "Pulih · lurus", before: currentGrip.straightRecovery, after: nextGrip.straightRecovery },
                ].map(row => <tr key={row.label} className="border-t border-border">
                  <th scope="row" className="px-md py-sm font-normal">{row.label}</th>
                  <td className="text-right">{formatCoins(row.before)}</td>
                  <td className="px-md text-right font-bold text-accent">{formatCoins(row.after)}</td>
                </tr>)}
              </tbody>
            </table>
            <p className="border-y border-border px-md py-md text-muted-foreground">Pengurasan lebih kecil, pemulihan lebih cepat. Pengurangan dihitung dari ban level 1, hingga {gripTuning(ceiling).drainReductionPercent}% di level {ceiling}. Efek grip hanya saat simulasi aktif; tidak mengubah koin atau lap server.</p>
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
        <SheetFooter>
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

export function UpgradePanel({ game, onUpgrade, onPreviewSheet, disabled = false }: UpgradePanelProps) {
  return (
    <section id="upgrades" tabIndex={-1} className="panel upgrade-panel" aria-label="Bengkel modifikasi">
      <SectionCardHeading
        icon={Wrench}
        title="Bengkel"
        aside={<Badge variant="secondary">{totalLevel(game)}/{game.economy.maxUpgradeLevel * PARTS.length} level</Badge>}
      />
      <div className="upgrade-list">
        {PARTS.map((part) => <ModificationSlot key={part.key} part={part} game={game} onUpgrade={onUpgrade} onPreviewSheet={onPreviewSheet} disabled={disabled} />)}
      </div>
    </section>
  );
}
