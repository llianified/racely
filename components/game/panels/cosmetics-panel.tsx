"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Check, CircleDot, Coins, LoaderCircle, Palette, ShoppingBag, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CAR_CATALOG } from "@/lib/car-catalog";
import { COSMETIC_SLOTS, COSMETIC_SLOT_LABELS, availableCosmetics, compatibleCosmetics, getCosmetic, type CosmeticSlot } from "@/lib/cosmetics";
import { coins, type GameState } from "@/lib/game";
import { cn } from "@/lib/utils";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status"><strong>Menyiapkan preview 3D…</strong></div>,
});
const SLOT_ICONS = { livery: Palette, wheel: CircleDot, spoiler: Wind };

type Props = {
  game: GameState;
  active: boolean;
  disabled: boolean;
  onBuy: (id: string) => Promise<boolean>;
  onEquip: (slot: CosmeticSlot, id: string | null) => Promise<boolean>;
};

export function CosmeticsPanel({ game, active, disabled, onBuy, onEquip }: Props) {
  const [view, setView] = useState<"shop" | "collection">("shop");
  const [slot, setSlot] = useState<CosmeticSlot | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const model = game.carSelection?.model ?? "neo-falcon";
  const catalog = compatibleCosmetics(model);
  const owned = catalog.filter(item => game.ownedCosmetics.includes(item.id));
  const available = availableCosmetics(model, game.ownedCosmetics);
  const items = (view === "shop" ? available : owned).filter(item => slot === "all" || item.slot === slot);
  const selected = selectedId ? getCosmetic(selectedId) : undefined;
  const isOwned = Boolean(selected && game.ownedCosmetics.includes(selected.id));
  const isEquipped = Boolean(selected && game.equippedCosmetics[selected.slot] === selected.id);
  const shortfall = selected ? Math.max(0, selected.price - game.balance) : 0;
  const blocked = disabled || busy;

  const transact = async (operation: () => Promise<boolean>, close = false) => {
    if (locked.current || blocked) return;
    locked.current = true;
    setBusy(true);
    try {
      if (await operation() && close) setSelectedId(null);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="panel cosmetics-panel" aria-label="Kosmetik mobil">
      <div className="panel-heading"><h2><ShoppingBag aria-hidden="true" />Gaya di lintasan</h2><span className="cosmetics-count">{owned.length}/{catalog.length}</span></div>
      <div className="cosmetics-intro"><p>Beli sekali. Milik selamanya.</p><span>Murni tampilan, tanpa bonus performa. Khusus {CAR_CATALOG[model].name} dan item universal.</span></div>
      <div className="cosmetics-views" role="group" aria-label="Tampilan kosmetik">
        <Button variant={view === "shop" ? "secondary" : "ghost"} aria-pressed={view === "shop"} onClick={() => setView("shop")}>Toko <span>{available.length}</span></Button>
        <Button variant={view === "collection" ? "secondary" : "ghost"} aria-pressed={view === "collection"} onClick={() => setView("collection")}>Koleksi <span>{owned.length}</span></Button>
      </div>
      {view === "collection" && owned.length > 0 && <div className="cosmetics-loadout" aria-label="Kosmetik terpasang">
        {COSMETIC_SLOTS.map(key => {
          const id = game.equippedCosmetics[key];
          return <div key={key}><span>{COSMETIC_SLOT_LABELS[key]}<strong>{id ? getCosmetic(id)?.name ?? "Bawaan" : "Bawaan"}</strong></span>{id && <Button variant="outline" size="xs" disabled={blocked} aria-label={`Lepas ${COSMETIC_SLOT_LABELS[key]}`} onClick={() => void transact(() => onEquip(key, null))}>Lepas</Button>}</div>;
        })}
      </div>}
      <div className="cosmetics-filters" role="group" aria-label="Kategori kosmetik">
        {(["all", ...COSMETIC_SLOTS] as const).map(key => <Button key={key} size="xs" variant={slot === key ? "outline" : "ghost"} aria-pressed={slot === key} onClick={() => setSlot(key)}>{key === "all" ? "Semua" : COSMETIC_SLOT_LABELS[key]}</Button>)}
      </div>
      {items.length ? <ul className="cosmetics-list">
        {items.map(item => {
          const Icon = SLOT_ICONS[item.slot];
          const equipped = game.equippedCosmetics[item.slot] === item.id;
          return <li key={item.id} className="cosmetics-item">
            <div className={cn("cosmetics-icon", equipped && "is-equipped")}><Icon aria-hidden="true" /></div>
            <div className="cosmetics-item-info"><span>{COSMETIC_SLOT_LABELS[item.slot]} · {item.model === "all" ? "Universal" : CAR_CATALOG[item.model].name}</span><h3>{item.name}</h3><p>{view === "shop" ? coins(item.price) : equipped ? "Terpasang" : "Milikmu · permanen"}</p></div>
            <Button variant={view === "shop" ? "outline" : "secondary"} size="sm" aria-label={`${view === "shop" ? "Lihat" : "Kelola"} ${item.name}`} onClick={() => { setShowPreview(true); setSelectedId(item.id); }}>{equipped ? <Check data-icon="inline-start" aria-hidden="true" /> : null}{view === "shop" ? "Lihat" : "Kelola"}</Button>
          </li>;
        })}
      </ul> : <div className="cosmetics-empty" role="status"><Check aria-hidden="true" /><strong>{view === "shop" ? available.length === 0 ? "Koleksimu lengkap!" : "Kategori ini sudah lengkap." : "Belum ada koleksi di sini."}</strong><p>{view === "shop" ? "Item yang dibeli pindah ke Koleksi. Pasang atau lepas kapan saja, gratis." : "Pilih tampilan di Toko. Setelah dibeli, item menjadi milikmu selamanya."}</p><Button variant="outline" size="sm" onClick={() => { setSlot("all"); setView(view === "shop" ? "collection" : "shop"); }}>{view === "shop" ? "Buka koleksi" : "Jelajahi toko"}</Button></div>}
      <p className="cosmetics-note">Pembelian memakai saldo koin. Tidak dapat dijual kembali.</p>
      <Dialog open={selectedId !== null && active} onOpenChange={open => { if (!open && !locked.current) setSelectedId(null); }}>
        <DialogContent className="cosmetics-dialog" showCloseButton={!busy}>
          <DialogHeader><DialogTitle>{selected?.name ?? "Kosmetik mobil"}</DialogTitle><DialogDescription>{isOwned ? "Milikmu selamanya. Pasang atau lepas tanpa biaya." : "Lihat di mobilmu sebelum membeli. Preview tidak mengubah mobil di lintasan."}</DialogDescription></DialogHeader>
          {selected && <>
            <div className="cosmetics-preview" role="img" aria-label={`${showPreview ? "Preview" : "Tampilan saat ini"} ${selected.name} pada ${CAR_CATALOG[model].name}`}>
              {selectedId && active && <CarPreviewScene color={game.color} model={model} levels={game.levels} cosmetics={showPreview ? { ...game.equippedCosmetics, [selected.slot]: selected.id } : game.equippedCosmetics} />}
            </div>
            <div className="cosmetics-compare"><span>{showPreview ? "PREVIEW KOSMETIK" : "TAMPILAN SAAT INI"}</span><Button variant="outline" size="sm" aria-pressed={showPreview} onClick={() => setShowPreview(value => !value)}>{showPreview ? "Bandingkan" : "Lihat preview"}</Button></div>
            <p className="text-read text-muted-foreground">{selected.description} Kecepatan, grip, dan reward tidak berubah.</p>
            {!isOwned && <dl className="cosmetics-price"><div><dt>Harga permanen</dt><dd>{coins(selected.price)}</dd></div><div><dt>Saldo saat ini</dt><dd>{coins(game.balance)}</dd></div><div><dt>{shortfall > 0 ? "Kekurangan" : "Saldo setelah beli"}</dt><dd>{coins(shortfall > 0 ? shortfall : game.balance - selected.price)}</dd></div></dl>}
            <p className="text-small text-muted-foreground" role="status">{isOwned ? isEquipped ? "Sedang terpasang di garasi dan lintasan." : "Pembelian tersimpan di Koleksi. Pasang untuk memakainya di lintasan." : shortfall > 0 ? "Koin belum cukup. Klaim hasil balapan atau hadiah terlebih dahulu." : "Koin dipotong setelah pembelian berhasil. Item pindah ke Koleksi, belum otomatis terpasang."}</p>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={busy} />}>Tutup</DialogClose>
              <Button variant="gold" disabled={blocked || (!isOwned && shortfall > 0)} aria-busy={busy} onClick={() => void transact(() => isOwned ? onEquip(selected.slot, isEquipped ? null : selected.id) : onBuy(selected.id), isOwned)}>
                {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : isOwned ? <Check data-icon="inline-start" /> : <Coins data-icon="inline-start" />}
                {busy ? "Menyimpan…" : isOwned ? isEquipped ? "Lepas kosmetik" : "Pasang kosmetik" : `Beli · ${coins(selected.price)}`}
              </Button>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
