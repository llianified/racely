import { Camera, Check, Flag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GameState } from "@/lib/game";

export type DialogKind = "help" | "circuits";

/** Both overlays share one Dialog so only one can ever be open. */
export function GameDialog({
  kind,
  onClose,
  game,
  onChooseCircuit,
  disabled,
}: {
  kind: DialogKind | null;
  onClose: () => void;
  game: GameState;
  onChooseCircuit: (circuit: number) => void;
  disabled: boolean;
}) {
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "circuits"
              ? "Pilih tempat ngegas"
              : "Mobil kecil. Langsung jalan."}
          </DialogTitle>
          <DialogDescription>
            {kind === "circuits"
              ? "Selesaikan putaran untuk membuka lintasan baru."
              : "Racely adalah game mini 4WD 3D independen dan tidak berafiliasi dengan produsen kendaraan atau mainan mana pun."}
          </DialogDescription>
        </DialogHeader>
        {kind === "circuits" ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="circuit"
              disabled={disabled}
              onClick={() => onChooseCircuit(0)}
            >
              Jakarta Raceway
              {game.circuit === 0 && <Check data-icon="inline-end" />}
            </Button>
            <Button
              variant="circuit"
              disabled={disabled || game.laps < 25}
              onClick={() => onChooseCircuit(1)}
            >
              Midnight Speedway
              <span>
                {game.circuit === 1 ? "Aktif" : game.laps >= 25 ? "Terbuka" : `${game.laps}/25 putaran`}
              </span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 text-sm">
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
            <p className="rounded-lg border border-border p-3 text-muted-foreground">
              Semua hadiah dan transaksi dihitung oleh server Racely. Progres
              terikat ke akun Telegram yang membuka Mini App.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
