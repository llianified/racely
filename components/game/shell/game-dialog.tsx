import { Camera, Check, Flag, Gauge, Timer, Zap } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { OFFLINE_CAP_SECONDS } from "@/lib/game-economy";

export type DialogKind = "help" | "circuits" | "welcome";

const DIALOG_COPY: Record<DialogKind, { title: string; description: string }> =
  {
    welcome: {
      title: "Selamat datang kembali!",
      description: "Mobilmu tetap muter di lintasan selama kamu pergi.",
    },
    circuits: {
      title: "Pilih tempat ngegas",
      description:
        "Midnight selalu membayar lebih per putaran. Jakarta ada kalau kamu lebih suka tampilannya.",
    },
    help: {
      title: "Mobil kecil. Langsung jalan.",
      description:
        "Racely adalah game mini 4WD 3D independen dan tidak berafiliasi dengan produsen kendaraan atau mainan mana pun.",
    },
  };

function WelcomeBack({
  offline,
  onClose,
}: {
  offline: OfflineEarnings;
  onClose: () => void;
}) {
  return (
    <div className="welcome-back">
      <div className="welcome-haul">
        <span>Koin offline</span>
        <strong>+{coins(offline.coins)}</strong>
        <small>
          Sudah masuk ke koin pending — klaim kapan saja dari panel Balapan.
        </small>
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
          Saat offline mobilmu jalan setengah kecepatan, dihitung maksimal{" "}
          {formatDuration(OFFLINE_CAP_SECONDS)}.
          {offline.capped
            ? ` Kamu pergi ${formatDuration(offline.awaySeconds)}, jadi sisanya tidak dihitung.`
            : ""}
        </span>
      </p>
      <Button variant="gold" size="lg" onClick={onClose}>
        Lanjut balapan
      </Button>
    </div>
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
  onChooseCircuit: (circuit: number) => void;
  disabled: boolean;
}) {
  // Closing sets kind to null while the popup is still fading out, so the copy
  // has to survive one more render or the body flashes to another dialog's.
  const shown = useRef<DialogKind>("help");
  // eslint-disable-next-line react-hooks/refs
  if (kind) shown.current = kind;
  // eslint-disable-next-line react-hooks/refs
  const active = kind ?? shown.current;

  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
    <SheetContent side="bottom" className="game-sheet p-lg">
      <SheetHeader className="p-0">
          <SheetTitle>{DIALOG_COPY[active].title}</SheetTitle>
          <SheetDescription>
            {DIALOG_COPY[active].description}
          </SheetDescription>
        </SheetHeader>
        {active === "welcome" && offline ? (
          <WelcomeBack offline={offline} onClose={onClose} />
        ) : active === "circuits" ? (
          <div className="circuit-choices">
            {/* Hasil per putaran ditampilkan di kedua tombol. Tanpa itu kedua
                sirkuit terlihat setara padahal Midnight selalu membayar lebih,
                dan "Kembali ke Jakarta" jadi tombol yang memotong penghasilan
                tanpa memberi tahu. Sekarang pilihannya jujur: pindah balik
                adalah soal selera tampilan, dan harganya kelihatan. */}
            <Button
              variant="circuit"
              disabled={disabled}
              onClick={() => onChooseCircuit(0)}
            >
              Jakarta Raceway
              <span>
                {coins(lapReward({ ...game, circuit: 0 }))} / putaran
                {game.circuit === 0 ? " · Aktif" : ""}
              </span>
              {game.circuit === 0 && <Check data-icon="inline-end" />}
            </Button>
            <Button
              variant="circuit"
              disabled={disabled || game.laps < 25}
              onClick={() => onChooseCircuit(1)}
            >
              Midnight Speedway
              <span>
                {game.laps < 25
                  ? `${game.laps}/25 putaran`
                  : `${coins(lapReward({ ...game, circuit: 1 }))} / putaran${game.circuit === 1 ? " · Aktif" : ""}`}
              </span>
              {game.circuit === 1 && <Check data-icon="inline-end" />}
            </Button>
          </div>
        ) : (
          <div className="help-steps">
            <div className="help-step">
              <Flag />
              <p>
                <strong>Balapan otomatis.</strong>
                <span>
                  Koin terkumpul setiap putaran dan tersimpan di server. Dua
                  mobil lain adalah bot latihan.
                </span>
              </p>
            </div>
            <div className="help-step">
              <Zap />
              <p>
                <strong>Boost, klaim, lalu upgrade.</strong>
                <span>
                  Gaspol 2× selama 10 detik, lalu isi ulang selama 25 detik.
                  Baterai terisi otomatis dan balapan normal tetap jalan.
                </span>
              </p>
            </div>
            <div className="help-step">
              <Timer />
              <p>
                <strong>Ditinggal pun tetap ngumpulin koin.</strong>
                <span>
                  Saat kamu tutup aplikasi, mobilmu jalan setengah kecepatan
                  sampai {formatDuration(OFFLINE_CAP_SECONDS)}. Hasilnya
                  langsung masuk koin pending.
                </span>
              </p>
            </div>
            <div className="help-step">
              <Camera />
              <p>
                <strong>Lintasanmu, dari semua sudut.</strong>
                <span>
                  Geser untuk orbit. Cubit untuk zoom. Gunakan tombol kamera
                  untuk berganti sudut.
                </span>
              </p>
            </div>
            <p className="help-footnote">
              Semua hadiah dan transaksi dihitung oleh server Racely. Progres
              terikat ke akun Telegram yang membuka Mini App.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
