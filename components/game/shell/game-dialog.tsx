import {
  ArrowRight, CalendarCheck, Camera, Check, ChevronDown, Coins, Flag, Gauge,
  Gift, Lock, Palette, Timer, UserPlus, Wallet, Wind, Wrench, Zap,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
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
  idr,
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
      title: "Cara bermain & FAQ",
      description: "Buka pertanyaan yang kamu butuhkan.",
    },
  };

/**
 * Satu-satunya tempat penjelasan hidup. Dulu keterangan yang sama tersebar
 * sebagai ikon info kecil di tiap panel; sekarang semuanya di sini, satu
 * dropdown per topik supaya lembarnya tidak jadi dinding teks.
 */
function faqItems(game: GameState): { icon: typeof Flag; question: string; answer: ReactNode }[] {
  const { economy } = game;
  return [
    {
      icon: Flag,
      question: "Bagaimana balapannya berjalan?",
      answer: "Balapan berjalan otomatis. Koin terkumpul setiap putaran dan tersimpan di server. Dua mobil lain adalah bot latihan.",
    },
    {
      icon: Zap,
      question: "Bagaimana cara pakai Gaspol?",
      answer: `Gaspol ${economy.boostMultiplier}× selama ${economy.boostDurationSeconds} detik, lalu isi ulang ${economy.batteryRechargeSeconds} detik. Balapan normal tetap jalan selama baterai terisi.`,
    },
    {
      icon: Timer,
      question: "Kalau aplikasinya ditutup, koin tetap jalan?",
      answer: `Ya. Mobilmu jalan ${Math.round(economy.offlineRate * 100)}% kecepatan sampai ${formatDuration(economy.offlineCapSeconds)}. Hasilnya masuk koin pending, tinggal diklaim saat kamu kembali.`,
    },
    {
      icon: Coins,
      question: "Bagaimana hadiah dihitung?",
      answer: "Semua hadiah berupa koin Racely. Pakai buat upgrade mesin atau kosmetik mobil di garasi.",
    },
    {
      icon: Wallet,
      question: "Bagaimana saldo dan penarikan bekerja?",
      answer: `Koin dari balapan masuk ke "belum diklaim" dulu. Setiap 1 koin penuh bisa kamu klaim ke saldo. Saldo bisa ditarik ke e-wallet atau rekening bank saat mencapai ${coins(economy.minWithdrawCoins)}, dengan nilai 1 koin = ${idr(1, economy)}. Penarikan diproses manual oleh admin.`,
    },
    {
      icon: CalendarCheck,
      question: "Kapan misi harian berganti?",
      answer: "Setiap pukul 00.00 WIB. Progresnya mengikuti sinkronisasi server, jadi angkanya sama di perangkat mana pun.",
    },
    {
      icon: Gift,
      question: "Apa itu mobil kamu di garasi?",
      answer: "Kecepatan dasar tanpa boost. Model 3D-nya sama dengan mobil di lintasan. Ganti warna bodi gratis dan langsung aktif.",
    },
    {
      icon: Wrench,
      question: "Apa efek modifikasi di bengkel?",
      answer: `Pilih part, cek perubahan performa, lalu konfirmasi pemasangan. Mesin dan ban mempercepat putaran; baterai menambah hasil koin. Baris "Arena" hanya untuk simulasi gerak: mesin mempercepat akselerasi, ban memperkuat grip, baterai memperpanjang cadangan boost. Tidak menambah koin, durasi Gaspol, atau baterai idle server. Setiap pemasangan menaikkan satu level, maksimal level ${economy.maxUpgradeLevel}.`,
    },
    {
      icon: Wind,
      question: "Aero kit menambah kecepatan?",
      answer: "Tidak. Aero kit murni kosmetik dan tidak memengaruhi kecepatan. Beli sekali, lalu lepas-pasang gratis dari koleksimu.",
    },
    {
      icon: Palette,
      question: "Koleksi cat memberi bonus?",
      answer: "Tidak. Cat hanya mengubah warna, tanpa bonus kecepatan atau penghasilan. Beli sekali, pasang gratis; warna bawaan tetap gratis.",
    },
    {
      icon: UserPlus,
      question: "Bagaimana bonus ajak teman dihitung?",
      answer: `Koin dihitung saat temanmu benar-benar main sampai ${economy.referralMilestoneLaps} putaran, bukan saat daftar. Tidak ada batas jumlah teman.`,
    },
    {
      icon: Camera,
      question: "Bisa lihat lintasan dari sudut lain?",
      answer: "Bisa. Geser untuk orbit, cubit untuk zoom, dan tombol kamera untuk berganti sudut.",
    },
  ];
}

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
            <div className="faq-list">
              {faqItems(game).map(({ icon: Icon, question, answer }) => (
                <details className="faq-item" key={question}>
                  <summary>
                    <Icon aria-hidden="true" />
                    <span>{question}</span>
                    <span className="faq-chevron"><ChevronDown aria-hidden="true" /></span>
                  </summary>
                  <div className="faq-answer">{answer}</div>
                </details>
              ))}
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
