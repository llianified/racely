import { ArrowRight, Camera, Check, Flag, Gauge, Lock, Palette, Timer, Zap } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  coins,
  formatDuration,
  lapReward,
  type GameState,
  type OfflineEarnings,
} from "@/lib/game";


export type DialogKind = "help" | "circuits" | "welcome";

const DIALOG_COPY: Record<DialogKind, { title: string; description: string }> =
  {
    welcome: {
      title: "Selamat datang kembali!",
      description: "Mobilmu tetap muter di lintasan selama kamu pergi.",
    },
    circuits: {
      title: "Progres trek",
      description: "Trek hanya maju. Bonus Midnight bersifat permanen.",
    },
    help: {
      title: "Mobil kecil. Langsung jalan.",
      description: "Lima hal inti sebelum kamu mulai.",
    },
  };

function WelcomeBack({
  offline,
  offlineCapSeconds,
}: {
  offline: OfflineEarnings;
  /** Dari config ekonomi, bukan konstanta build -- lihat lib/economy-config.ts. */
  offlineCapSeconds: number;
}) {
  return (
    <div className="welcome-back">
      <div className="welcome-haul">
        <span>Koin offline</span>
        <strong>+{coins(offline.coins)}</strong>
        <small>Koin pending. Klaim di panel Balapan.</small>
      </div>
      <dl className="welcome-stats">
        <div>
          <dt>
            <Timer aria-hidden="true" />
            Offline
          </dt>
          <dd>{formatDuration(offline.creditedSeconds)}</dd>
        </div>
        <div>
          <dt>
            <Flag aria-hidden="true" />
            Putaran
          </dt>
          <dd>{offline.laps.toLocaleString("id-ID")}</dd>
        </div>
      </dl>
      <p className="welcome-note">
        <Gauge aria-hidden="true" />
        <span>
          Offline: ½ kecepatan, maksimal {formatDuration(offlineCapSeconds)}.
          {offline.capped
            ? ` Kamu pergi ${formatDuration(offline.awaySeconds)}; sisanya tidak dihitung.`
            : ""}
        </span>
      </p>
    </div>
  );
}

type CircuitRowState = "active" | "open" | "locked" | "passed";

function CircuitRow({
  name,
  meta,
  state,
  disabled,
  onClick,
}: {
  name: string;
  meta: string;
  state: CircuitRowState;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const label =
    state === "active"
      ? "Aktif"
      : state === "open"
        ? "Pilih"
        : state === "locked"
          ? "Terkunci"
          : "Selesai";
  return (
    <li>
      <button
        type="button"
        className="circuit-row"
        data-state={state}
        disabled={disabled || state !== "open"}
        aria-current={state === "active" ? "true" : undefined}
        onClick={onClick}
      >
        <div>
          <strong>{name}</strong>
          <small>{meta}</small>
        </div>
        <span>
          {label}
          {state === "active" && <Check aria-hidden="true" />}
          {state === "open" && <ArrowRight aria-hidden="true" />}
          {state === "locked" && <Lock aria-hidden="true" />}
        </span>
      </button>
    </li>
  );
}

/** All three overlays share one Dialog so only one can ever be open. */
export function GameDialog({
  kind,
  onClose,
  game,
  offline,
  onChooseCircuit,
  disabled,
}: {
  kind: DialogKind | null;
  onClose: () => void;
  game: GameState;
  offline: OfflineEarnings | null;
  onChooseCircuit: (circuit: 1) => void;
  disabled: boolean;
}) {
  // Closing sets kind to null while the popup is still fading out, so the copy
  // has to survive one more render or the body flashes to another dialog's.
  const shown = useRef<DialogKind>("help");
  // eslint-disable-next-line react-hooks/refs
  if (kind) shown.current = kind;
  // eslint-disable-next-line react-hooks/refs
  const active = kind ?? shown.current;
  const unlockLaps = game.economy.circuitUnlockLaps;
  const midnightLocked = game.laps < unlockLaps;

  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom" className="game-sheet">
        <SheetHeader>
          <SheetTitle>{DIALOG_COPY[active].title}</SheetTitle>
          <SheetDescription>
            {DIALOG_COPY[active].description}
          </SheetDescription>
        </SheetHeader>
        {active === "welcome" && offline ? (
          <>
            <div className="sheet-body">
              <WelcomeBack
                offline={offline}
                offlineCapSeconds={game.economy.offlineCapSeconds}
              />
            </div>
            <SheetFooter>
              <Button variant="gold" onClick={onClose}>
                Lanjut balapan
              </Button>
            </SheetFooter>
          </>
        ) : active === "circuits" ? (
          <div className="sheet-body">
            <ul className="circuit-list">
              <CircuitRow
                name="Jakarta Raceway"
                meta={`${coins(lapReward({ ...game, circuit: 0 }))} / putaran`}
                state={game.circuit === 0 ? "active" : "passed"}
              />
              <CircuitRow
                name="Midnight Speedway"
                meta={
                  midnightLocked
                    ? `Butuh ${unlockLaps} putaran · ${game.laps}/${unlockLaps}`
                    : `${coins(lapReward({ ...game, circuit: 1 }))} / putaran`
                }
                state={
                  game.circuit === 1 ? "active" : midnightLocked ? "locked" : "open"
                }
                disabled={disabled}
                onClick={() => onChooseCircuit(1)}
              />
            </ul>
          </div>
        ) : (
          <div className="sheet-body">
            <div className="help-steps">
              <div className="help-step">
                <Flag aria-hidden="true" />
                <p>
                  <strong>Balapan otomatis</strong>
                  <span>
                    Koin terkumpul setiap putaran dan tersimpan di server. Dua
                    mobil lain adalah bot latihan.
                  </span>
                </p>
              </div>
              <div className="help-step">
                <Zap aria-hidden="true" />
                <p>
                  <strong>Boost, klaim, lalu upgrade</strong>
                  <span>
                    Gaspol {game.economy.boostMultiplier}× selama{" "}
                    {game.economy.boostDurationSeconds} detik, lalu isi ulang{" "}
                    {game.economy.batteryRechargeSeconds} detik. Balapan normal
                    tetap jalan selama baterai terisi.
                  </span>
                </p>
              </div>
              <div className="help-step">
                <Timer aria-hidden="true" />
                <p>
                  <strong>Ditinggal pun tetap ngumpulin koin</strong>
                  <span>
                    {/* Lajunya `offlineRate`, bukan selalu setengah: nilainya bisa
                        disetel dari panel admin. */}
                    Saat aplikasi ditutup, mobilmu jalan{" "}
                    {Math.round(game.economy.offlineRate * 100)}% kecepatan
                    sampai {formatDuration(game.economy.offlineCapSeconds)}.
                    Hasilnya masuk koin pending.
                  </span>
                </p>
              </div>
              <div className="help-step">
                <Camera aria-hidden="true" />
                <p>
                  <strong>Lintasanmu, dari semua sudut</strong>
                  <span>
                    Geser untuk orbit, cubit untuk zoom, tombol kamera untuk
                    berganti sudut.
                  </span>
                </p>
              </div>
              <div className="help-step">
                <Palette aria-hidden="true" />
                <p>
                  <strong>Koleksi cat cuma gaya</strong>
                  <span>
                    Hanya mengubah warna, tanpa bonus kecepatan atau
                    penghasilan. Beli sekali, pasang gratis; warna bawaan tetap
                    gratis.
                  </span>
                </p>
              </div>
            </div>
            <p className="sheet-note">
              Semua hadiah dan transaksi dihitung oleh server Racely; progres
              terikat ke akun Telegram yang membuka Mini App. Racely adalah game
              mini 4WD 3D independen, tidak berafiliasi dengan produsen kendaraan
              atau mainan mana pun.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
