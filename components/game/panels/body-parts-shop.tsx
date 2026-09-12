"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, LoaderCircle, RotateCcw, ShoppingBag, Wind, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PART_CATALOG, PART_IDS, PART_SLOTS, SLOT_LABELS, type PartCommand, type PartId } from "@/lib/car-parts";
import { CAR_CATALOG } from "@/lib/car-catalog";
import { coins, type GameState } from "@/lib/game";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status">Menyiapkan part 3D…</div>,
});

type ShopProps = {
  game: GameState;
  active: boolean;
  disabled: boolean;
  onAction: (action: PartCommand) => Promise<boolean>;
};

function ShopContents({ game, disabled, onAction, onPending }: Omit<ShopProps, "active"> & { onPending: (value: boolean) => void }) {
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
    <div className="parts-shop-scroll">
      <div className="parts-shop-stage" role="img" aria-label={`${CAR_CATALOG[model].name}: ${trying ? `pratinjau ${part.name}, belum disimpan` : "part yang terpasang"}`}>
        <CarPreviewScene color={game.color} model={model} levels={game.levels} equipped={previewParts} interactive />
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
    <div className="parts-shop-footer">
      <Button variant={installed ? "outline" : "gold"} disabled={blocked || (!owned && shortfall > 0)} aria-busy={pending} onClick={() => void submit(!owned ? { type: "buy-part", partId: selected } : installed ? { type: "unequip-part", slot: part.slot } : { type: "equip-part", partId: selected })}>
        {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : !owned ? <ShoppingBag data-icon="inline-start" /> : installed ? <RotateCcw data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
        {pending ? "Memproses…" : !owned ? `Beli ${part.name} · ${coins(part.price)}` : installed ? `Lepas ${part.name}` : `Pasang ${part.name} · Gratis`}
      </Button>
      <span role="status">{owned ? "Milikmu selamanya · lepas-pasang gratis" : "Hanya tombol Beli yang memotong koin"}</span>
    </div>
  </>;
}

export function BodyPartsShop({ game, active, disabled, onAction }: ShopProps) {
  const [open, setOpen] = useState(false);
  const pending = useRef(false);
  const ownedCount = game.bodyParts?.owned.length ?? 0;
  const equippedCount = Object.keys(game.bodyParts?.equipped ?? {}).length;
  return <Dialog open={open && active} onOpenChange={value => { if (!pending.current) setOpen(value); }}>
    <div className="garage-parts">
      <div className="garage-parts-heading">
        <div className="garage-parts-title">
          <div><Wind aria-hidden="true" /><h3>Aero kit</h3><Badge variant="secondary">{equippedCount} / {PART_SLOTS.length} aktif</Badge></div>
          <p>{ownedCount} dari {PART_IDS.length} part sudah masuk koleksi.</p>
        </div>
      </div>
      <dl className="garage-parts-slots" aria-label="Slot aero kit terpasang">
        {PART_SLOTS.map(slot => {
          const id = game.bodyParts?.equipped[slot];
          return <div key={slot} data-fitted={Boolean(id)}>
            <dt><span aria-hidden="true" />{SLOT_LABELS[slot]}</dt>
            <dd><strong>{id ? PART_CATALOG[id].name : "Part bawaan"}</strong><span>{id ? <><Check aria-hidden="true" />Aktif</> : "Setelan pabrik"}</span></dd>
          </div>;
        })}
      </dl>
      <DialogTrigger render={<Button variant="gold" className="w-full" disabled={disabled} />}><ShoppingBag data-icon="inline-start" />Buka toko</DialogTrigger>
    </div>
    <DialogContent className="parts-shop-dialog">
      <DialogHeader className="parts-shop-header">
        <DialogTitle>Toko aero kit</DialogTitle>
        <DialogDescription>Coba langsung pada mobilmu, koleksi, lalu pasang ke slot yang sesuai.</DialogDescription>
      </DialogHeader>
      {open && active && <ShopContents game={game} disabled={disabled} onAction={onAction} onPending={value => { pending.current = value; }} />}
    </DialogContent>
  </Dialog>;
}
