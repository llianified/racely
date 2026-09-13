"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { ArrowRight, Check, Crown, LoaderCircle, Orbit, Sandwich, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CAR_CATALOG, PREMIUM_CAR_IDS, type CarModelId, type PremiumCarId } from "@/lib/car-catalog";
import { ownedCarIds, type CarCommand } from "@/lib/car-collection";
import { carPriceAt } from "@/lib/economy-config";
import { coins, type GameState } from "@/lib/game";
import { SectionCardHeading } from "../shell/section-card-heading";

const CarPreviewScene = dynamic(() => import("../scene/car-preview-scene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><strong>Menyiapkan mobil 3D…</strong></div>,
});

const COLLECTION_ICONS: Record<PremiumCarId, LucideIcon> = { "bebek-sultan": Crown, "burger-oleng": Sandwich, "ufo-gabut": Orbit };

export function CarCollection({ game, active, disabled, onAction }: {
  game: GameState;
  active: boolean;
  disabled: boolean;
  onAction: (action: CarCommand) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<PremiumCarId | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const current = game.carSelection?.model ?? null;
  const owned = ownedCarIds(game.ownedCars, current);
  const blocked = disabled || pending;
  const car = selected ? CAR_CATALOG[selected] : null;
  const price = selected ? carPriceAt(game.economy, selected) : 0;
  const hasSelected = selected ? owned.includes(selected) : false;
  const shortfall = Math.max(0, price - game.balance);
  const collectionCount = PREMIUM_CAR_IDS.filter(id => owned.includes(id)).length;

  const submit = async (action: CarCommand) => {
    if (blocked || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      if (await onAction(action)) setSelected(null);
      else setError("Belum berhasil. Koleksi dan saldo mengikuti konfirmasi server; periksa koneksi lalu coba lagi.");
    } catch {
      setError("Koneksi terputus. Coba lagi untuk memastikan status mobilmu.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  };

  return <>
    <section id="car-collection" tabIndex={-1} className="panel car-collection" aria-label="Koleksi mobil">
      <SectionCardHeading icon={Sparkles} title="Garasi si paling…" aside={<Badge variant="secondary">{collectionCount}/{PREMIUM_CAR_IDS.length} spesial</Badge>} />
      <p className="collection-intro">Bukan mobil biasa. Ini geng pembuat onar.</p>
      <div className="collection-catalog">
        {PREMIUM_CAR_IDS.map((id, index) => {
          const Icon = COLLECTION_ICONS[id];
          const has = owned.includes(id);
          return <button key={id} type="button" className="collection-card" data-character={id} disabled={blocked} onClick={() => { setSelected(id); setError(null); }} aria-label={`Lihat ${CAR_CATALOG[id].name}`}>
            <span className="collection-card-top"><span className="collection-number">0{index + 1}</span><Icon aria-hidden="true" /></span>
            <strong>{CAR_CATALOG[id].name}</strong>
            <span className="collection-tagline">{CAR_CATALOG[id].tagline}</span>
            <span className="collection-card-price">{has ? <><Check aria-hidden="true" />{current === id ? "Aktif" : "Dimiliki"}</> : <>{coins(carPriceAt(game.economy, id))}<ArrowRight aria-hidden="true" /></>}</span>
          </button>;
        })}
      </div>
      <p className="collection-note">Detail ekstra, karakter ekstra. Kosmetik saja; kecepatan dan hasil koin tetap dari upgrade.</p>
      <div className="collection-owned">
        <h3>Geng kamu <span>{owned.length} mobil</span></h3>
        <ToggleGroup<CarModelId> className="collection-switcher" aria-label="Pakai mobil milikmu" value={current ? [current] : []} disabled={blocked} onValueChange={values => {
          const model = values[0];
          if (model && model !== current && owned.includes(model)) void submit({ type: "equip-car", model });
        }}>
          {owned.map(id => <Toggle className="collection-owned-car" key={id} value={id}><Check aria-hidden="true" /><span>{CAR_CATALOG[id].name}</span></Toggle>)}
        </ToggleGroup>
        <p>Ganti mobil gratis. Level upgrade dan part tetap milikmu.</p>
      </div>
      {error && !selected && <p className="form-error" role="alert">{error}</p>}
    </section>
    <Sheet open={Boolean(selected) && active} onOpenChange={value => { if (!value && !lock.current) setSelected(null); }}>
      <SheetContent side="bottom" className="game-sheet collection-sheet" showCloseButton={!pending}>
        <SheetHeader>
          <SheetTitle>{car?.name ?? "Koleksi spesial"}</SheetTitle>
          <SheetDescription>{car?.description ?? "Kenalan dengan geng pembuat onar."}</SheetDescription>
        </SheetHeader>
        {selected && car && active && <>
          <div className="sheet-body" data-flush>
            <div className="collection-preview" data-character={selected} role="img" aria-label={`Pratinjau 3D ${car.name}. Belum dibeli. Geser untuk memutar.`}>
              <CarPreviewScene model={selected} color={current === selected ? game.color : car.defaultColor} levels={game.levels} />
            </div>
            <div className="collection-detail">
              <div className="collection-detail-heading"><Badge variant="secondary"><Sparkles data-icon="inline-start" />Koleksi spesial</Badge><span>{hasSelected ? "Sudah jadi gengmu" : "Beli sekali, milik selamanya"}</span></div>
              <h3>{car.detail}</h3>
              <p>Lebih niat, lebih nyeleneh dari starter. Termasuk 3 pilihan warna gratis. Tanpa bonus kecepatan atau koin.</p>
              <dl className="parts-shop-pricing">
                <div><dt>Saldo kamu</dt><dd>{coins(game.balance)}</dd></div>
                {!hasSelected && <><div><dt>Harga mobil</dt><dd>{coins(price)}</dd></div><div><dt>{shortfall > 0 ? "Masih kurang" : "Saldo setelah beli"}</dt><dd>{coins(shortfall > 0 ? shortfall : game.balance - price)}</dd></div></>}
              </dl>
              <p role="status">{!hasSelected && shortfall > 0 ? "Kumpulkan koin dari balapan dan hadiah, lalu mampir lagi!" : "Mobil lama tetap di garasi. Upgrade dan part tidak hilang saat ganti mobil."}</p>
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          </div>
          <SheetFooter>
            <SheetClose render={<Button variant="outline" disabled={pending} />}>Nanti dulu</SheetClose>
            <Button variant="gold" disabled={blocked || current === selected || (!hasSelected && shortfall > 0)} aria-busy={pending} onClick={() => void submit({ type: hasSelected ? "equip-car" : "buy-car", model: selected })}>
              {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : hasSelected ? <Check data-icon="inline-start" /> : <ShoppingBag data-icon="inline-start" />}
              {pending ? "Memproses…" : current === selected ? "Sedang dipakai" : hasSelected ? "Pakai mobil" : `Beli & pakai · ${coins(price)}`}
            </Button>
            <span className="sheet-footnote">{hasSelected ? "Ganti mobil tanpa biaya" : "Koin dipotong hanya saat pembelian berhasil"}</span>
          </SheetFooter>
        </>}
      </SheetContent>
    </Sheet>
  </>;
}
