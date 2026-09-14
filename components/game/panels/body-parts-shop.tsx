"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, LoaderCircle, RotateCcw, ShoppingBag, Wind, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PART_CATALOG, PART_IDS, PART_SLOTS, SLOT_LABELS, type PartCommand, type PartId } from "@/lib/car-parts";
import { CAR_CATALOG } from "@/lib/car-catalog";
import { coins, type GameState } from "@/lib/game";
import { SectionCardHeading } from "../shell/section-card-heading";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      <strong>Menyiapkan mobil 3D…</strong>
    </div>
  ),
});

type ShopProps = {
  game: GameState;
  active: boolean;
  disabled: boolean;
  onAction: (action: PartCommand) => Promise<boolean>;
  onPreviewSheet: (open: boolean) => void;
};

function ShopContents({ game, disabled, onAction, onPending }: Omit<ShopProps, "active" | "onPreviewSheet"> & { onPending: (value: boolean) => void }) {
  const [selected, setSelected] = useState<PartId>("vented-hood");
  const [trying, setTrying] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const part = PART_CATALOG[selected];
  const owned = game.bodyParts?.owned.includes(selected) ?? false;
  const equipped = game.bodyParts?.equipped ?? {};
  const installed = equipped[part.slot] === selected;
  const shortfall = Math.max(0, part.price - game.balance);
  const model = game.carSelection?.model ?? "neo-falcon";
  const previewParts = trying ? { ...equipped, [part.slot]: selected } : equipped;
  const blocked = pending || disabled;

  const submit = async (action: PartCommand) => {
    if (lock.current || blocked) return;
    lock.current = true;
    setPending(true);
    onPending(true);
    setError(null);
    try {
      if (await onAction(action)) {
        if (action.type !== "buy-part") setTrying(false);
      } else {
        setError("Perubahan belum dikonfirmasi. Periksa pesan kesalahan lalu coba lagi; status di sini mengikuti data server.");
      }
    } catch {
      setError("Part belum bisa diproses. Coba lagi setelah koneksi pulih.");
    } finally {
      lock.current = false;
      setPending(false);
      onPending(false);
    }
  };

  return <>
    <div className="sheet-body" data-flush>
      <div className="parts-shop-stage" role="img" aria-label={`${CAR_CATALOG[model].name}: ${trying ? `pratinjau ${part.name}, belum disimpan` : "part yang terpasang"}`}>
        <CarPreviewScene color={game.color} model={model} levels={game.levels} equipped={previewParts} />
      </div>
      <div className="parts-shop-preview-bar">
        <div className="parts-shop-preview-state">
          <span aria-hidden="true" />
          <div><small>MODE VISUAL</small><strong>{trying ? "Pratinjau part" : "Setelan terpasang"}</strong></div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTrying(value => !value)} aria-pressed={trying}>
          <RotateCcw data-icon="inline-start" />{trying ? "Bandingkan" : "Coba part"}
        </Button>
      </div>
      <div className="parts-shop-content">
        <ToggleGroup<PartId> className="parts-shop-catalog" aria-label="Pilih part untuk dicoba" value={[selected]} disabled={pending} onValueChange={values => {
          if (!values[0]) return;
          setSelected(values[0]);
          setTrying(true);
          setError(null);
        }}>
          {PART_IDS.map(id => {
            const item = PART_CATALOG[id];
            const has = game.bodyParts?.owned.includes(id);
            const fitted = equipped[item.slot] === id;
            return <Toggle key={id} value={id} className="parts-shop-choice">
              <span className="parts-shop-choice-slot">{SLOT_LABELS[item.slot]}</span>
              <strong>{item.name}</strong>
              <span className="parts-shop-choice-state" data-fitted={fitted || undefined}>
                {fitted && <Check aria-hidden="true" />}{fitted ? "Terpasang" : has ? "Dimiliki" : coins(item.price)}
              </span>
            </Toggle>;
          })}
        </ToggleGroup>
        <section className="parts-shop-detail" aria-label={`Detail ${part.name}`}>
          <div className="parts-shop-heading"><div><span className="eyebrow">{SLOT_LABELS[part.slot]}</span><h3>{part.name}</h3></div><Badge variant="secondary">{installed ? "Terpasang" : owned ? "Dimiliki" : "Belum dimiliki"}</Badge></div>
          <p className="parts-shop-description">{part.description}</p>
          <dl className="parts-shop-specs">
            <div><dt>Finishing</dt><dd>{part.finish}</dd></div>
            <div><dt>Kompatibel</dt><dd>{CAR_CATALOG[model].name}</dd></div>
          </dl>
          <dl className="parts-shop-pricing">
            <div><dt>Saldo koin</dt><dd>{coins(game.balance)}</dd></div>
            {!owned && <div><dt>{shortfall > 0 ? "Kekurangan" : "Saldo setelah beli"}</dt><dd>{coins(shortfall > 0 ? shortfall : game.balance - part.price)}</dd></div>}
          </dl>
          <div className="parts-shop-note">
            <Wind aria-hidden="true" />
            <p>{!owned
              ? shortfall > 0 ? "Klaim hasil balapan atau hadiah untuk menambah saldo." : "Kosmetik murni. Beli sekali, lalu lepas-pasang gratis dari koleksimu."
              : installed ? "Sedang aktif. Lepas untuk kembali ke setelan pabrik tanpa menghapus koleksi." : equipped[part.slot] ? `Akan menggantikan ${PART_CATALOG[equipped[part.slot]!].name}; part lama tetap dimiliki.` : "Siap dipasang tanpa biaya tambahan."}</p>
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </div>
    <SheetFooter>
      <Button variant={installed ? "outline" : "gold"} disabled={blocked || (!owned && shortfall > 0)} aria-busy={pending} onClick={() => void submit(!owned ? { type: "buy-part", partId: selected } : installed ? { type: "unequip-part", slot: part.slot } : { type: "equip-part", partId: selected })}>
        {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : !owned ? <ShoppingBag data-icon="inline-start" /> : installed ? <RotateCcw data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
        {pending ? "Memproses…" : !owned ? `Beli ${part.name} · ${coins(part.price)}` : installed ? `Lepas ${part.name}` : `Pasang ${part.name} · Gratis`}
      </Button>
      <span className="sheet-footnote" role="status">{owned ? "Milikmu selamanya · lepas-pasang gratis" : "Hanya tombol Beli yang memotong koin"}</span>
    </SheetFooter>
  </>;
}

export function BodyPartsShop({ game, active, disabled, onAction, onPreviewSheet }: ShopProps) {
  const [open, setOpen] = useState(false);
  const pending = useRef(false);
  // Panggung toko baru hidup ketika sheet-nya terbuka DI tab Garasi -- syarat
  // yang sama dengan yang merender CarPreviewScene di bawah. Selama itu,
  // panggung garasi di belakangnya melepas context-nya supaya tidak ada dua
  // context WebGL hidup sekaligus.
  const previewLive = open && active;
  useEffect(() => {
    if (!previewLive) return;
    onPreviewSheet(true);
    return () => onPreviewSheet(false);
  }, [previewLive, onPreviewSheet]);
  const ownedCount = game.bodyParts?.owned.length ?? 0;
  const equippedCount = Object.keys(game.bodyParts?.equipped ?? {}).length;
  return <Sheet open={open && active} onOpenChange={value => { if (!pending.current) setOpen(value); }}>
    <section id="aero-kit" tabIndex={-1} className="panel garage-parts" aria-label="Aero kit">
      <SectionCardHeading
        icon={Wind}
        title="Aero kit"
        aside={<Badge variant="secondary">{equippedCount}/{PART_SLOTS.length} terpasang</Badge>}
      />
      <dl className="garage-parts-slots" aria-label="Slot aero kit">
        {PART_SLOTS.map(slot => {
          const id = game.bodyParts?.equipped[slot];
          return <div key={slot} data-fitted={Boolean(id)}>
            <dt>{SLOT_LABELS[slot]}</dt>
            <dd>{id ? <><Check aria-hidden="true" /><strong>{PART_CATALOG[id].name}</strong></> : <span>Bawaan</span>}</dd>
          </div>;
        })}
      </dl>
      <div className="garage-parts-foot">
        <p><strong>{ownedCount}/{PART_IDS.length}</strong> part dimiliki</p>
        <SheetTrigger render={<Button variant="gold" size="sm" disabled={disabled} />}><ShoppingBag data-icon="inline-start" />Buka toko</SheetTrigger>
      </div>
    </section>
    <SheetContent side="bottom" className="game-sheet">
      <SheetHeader>
        <SheetTitle>Toko aero kit</SheetTitle>
        <SheetDescription>Coba langsung pada mobilmu, koleksi, lalu pasang ke slot yang sesuai.</SheetDescription>
      </SheetHeader>
      {previewLive && <ShopContents game={game} disabled={disabled} onAction={onAction} onPending={value => { pending.current = value; }} />}
    </SheetContent>
  </Sheet>;
}
