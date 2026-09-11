"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  CircleHelp,
  Flag,
  Zap,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameNavigation, Topbar, type GameTab } from "./game-navigation";
import { GaragePanel, UpgradePanel } from "./garage-panel";
import { CircuitPanel } from "./circuit-panel";
import { RacePanel, RaceReward } from "./race-panel";
import { RewardsPanel, claimableTotal } from "./rewards-panel";
import { MenuPanel } from "./menu-panel";
import { WalletPanel, type WithdrawPayload } from "./wallet-panel";
import { InfoHint } from "./info-hint";
import {
  coins,
  gameReducer,
  idr,
  INITIAL_GAME,
  MISSIONS,
  missionValue,
  STARTER_GIFT,
  totalLevel,
  upgradeCost,
  type GameCommand,
  type GameState,
  type Upgrade,
} from "@/lib/game";
import { cn } from "@/lib/utils";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  platform: string;
  initData: string;
  isVersionAtLeast: (version: string) => boolean;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  HapticFeedback?: { impactOccurred: (style: "light" | "medium") => void };
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type GameKey = readonly [url: string, initData: string];

const TITLES: Record<GameTab, string> = {
  menu: "Menu",
  race: "Balapan",
  garage: "Garasi",
  rewards: "Hadiah",
  wallet: "Dompet",
};

function requestHeaders(initData: string) {
  return initData ? { Authorization: `tma ${initData}` } : undefined;
}

async function readGameResponse(response: Response): Promise<GameState> {
  const result = (await response.json()) as GameState | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in result && result.error
        ? result.error
        : "Progres Racely belum bisa dimuat.",
    );
  }
  return result as GameState;
}

function BootScreen() {
  return (
    <main className="boot-screen">
      <h1 className="boot-word">RACELY</h1>
      <div
        className="boot-bar"
        role="progressbar"
        aria-label="Memuat Racely"
        aria-busy="true"
      >
        <span />
      </div>
    </main>
  );
}

function GameGate({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-foreground">
      <Toaster theme="dark" position="top-center" />
      <section className="panel flex w-full max-w-md flex-col items-center gap-5 p-8">
        <div className="brand-mark flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Flag />
        </div>
        <div>
          <p className="eyebrow">RACELY TELEGRAM MINI APP</p>
          <h1 className="mt-2 text-2xl font-semibold">
            Start your engine in Telegram.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {error.message}
          </p>
        </div>
        {onRetry ? (
          <Button variant="gold" size="lg" className="w-full" onClick={onRetry}>
            Coba sinkronkan lagi
          </Button>
        ) : (
          <a
            href="https://t.me/RacelyBot?startapp=play"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "gold", size: "lg", className: "w-full" })}
          >
            Buka @RacelyBot
            <ArrowUpRight data-icon="inline-end" />
          </a>
        )}
      </section>
    </main>
  );
}

export function GameDashboard() {
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME);
  const [tab, setTab] = useState<GameTab>("race");
  const [dialog, setDialog] = useState<"help" | "circuits" | null>(null);
  const [clientReady, setClientReady] = useState(false);
  const [initData, setInitData] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [raceMounted, setRaceMounted] = useState(false);
  const [garageMounted, setGarageMounted] = useState(false);
  const synced = useRef(false);
  const bootstrapped = useRef(false);
  const mutationLocked = useRef(false);
  const navigationTarget = useRef<string | null>(null);

  useEffect(() => {
    const targetId = navigationTarget.current;
    if (!targetId) return;
    navigationTarget.current = null;
    const target = document.getElementById(targetId);
    target?.focus({ preventScroll: true });
    if (targetId !== "page-title") target?.scrollIntoView({ block: "start" });
  }, [tab]);

  useEffect(() => {
    if (raceMounted) return;
    if (tab === "race") {
      setRaceMounted(true);
      return;
    }
    // Warm the arena off-stage so the first switch to Balapan has nothing left to build.
    const idle = window.setTimeout(() => setRaceMounted(true), 1500);
    return () => window.clearTimeout(idle);
  }, [tab, raceMounted]);

  // Once Garasi has been opened it stays mounted off-stage, so its WebGL
  // preview is never torn down and rebuilt when the tab is revisited.
  useEffect(() => {
    if (tab === "garage") setGarageMounted(true);
  }, [tab]);

  const gameKey = clientReady ? (["/api/game", initData] as const) : null;
  const { data, error, isLoading, mutate } = useSWR<GameState>(
    gameKey,
    async ([url, signedInitData]: GameKey) => {
      const response = bootstrapped.current
        ? await fetch(`${url}/action`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...requestHeaders(signedInitData),
            },
            body: JSON.stringify({
              requestId: crypto.randomUUID(),
              action: { type: "sync" },
            }),
            credentials: "same-origin",
          })
        : await fetch(url, {
            headers: requestHeaders(signedInitData),
            cache: "no-store",
            credentials: "same-origin",
          });
      const next = await readGameResponse(response);
      bootstrapped.current = true;
      return next;
    },
    {
      refreshInterval: 5000,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (app && app.platform !== "unknown") {
      app.ready();
      app.expand();
      setInitData(app.initData ?? "");
      if (app.isVersionAtLeast("6.9")) {
        app.setHeaderColor("#090c1d");
        app.setBackgroundColor("#090c1d");
      }
    }
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!data) return;
    synced.current = true;
    dispatch({ type: "hydrate", state: data });
  }, [data]);

  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (synced.current && !document.hidden)
        dispatch({ type: "tick", delta: (now - last) / 1000 });
      last = now;
    }, 100);
    return () => clearInterval(id);
  }, []);

  const navigate = (next: GameTab, target?: string) => {
    const targetId = target ?? "page-title";
    window.scrollTo({ top: 0, behavior: "instant" });
    if (next === tab) {
      const element = document.getElementById(targetId);
      element?.focus({ preventScroll: true });
      if (target) element?.scrollIntoView({ block: "start" });
      return;
    }
    navigationTarget.current = targetId;
    setTab(next);
  };
  const haptic = () => {
    const app = window.Telegram?.WebApp;
    if (app?.isVersionAtLeast("6.1"))
      app.HapticFeedback?.impactOccurred("light");
  };

  const runAction = async (
    action: GameCommand,
    actionKey: string = action.type,
  ) => {
    if (mutationLocked.current) return null;
    mutationLocked.current = true;
    setBusyAction(actionKey);
    try {
      const response = await fetch("/api/game/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...requestHeaders(initData),
        },
        body: JSON.stringify({ requestId: crypto.randomUUID(), action }),
        credentials: "same-origin",
      });
      const next = await readGameResponse(response);
      dispatch({ type: "hydrate", state: next });
      await mutate(next, { revalidate: false });
      haptic();
      return next;
    } catch (actionError) {
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "Aksi belum bisa diproses.",
      );
      return null;
    } finally {
      mutationLocked.current = false;
      setBusyAction(null);
    }
  };

  const upgrade = async (key: Upgrade) => {
    if (
      game.levels[key] >= 10 ||
      game.balance < upgradeCost(key, game.levels[key])
    )
      return;
    const next = await runAction({ type: "upgrade", key }, `upgrade:${key}`);
    if (next)
      toast.success(
        `${{ engine: "Mesin", tires: "Ban & roller", battery: "Baterai" }[key]} → Level ${next.levels[key]}`,
        {
          description: "Terpasang dan tersimpan. Langsung aktif di lintasan.",
          duration: 2200,
        },
      );
  };
  const claim = async () => {
    const amount = Math.floor(game.pending);
    if (amount < 1) return;
    if (await runAction({ type: "claim" }))
      toast.success(`+${coins(amount)} masuk saldo`, {
        description: `Setara ${idr(amount)} dan siap ditarik lewat Dompet.`,
        duration: 2200,
      });
  };
  const gift = async () => {
    if (game.rewardClaimed) return;
    if (await runAction({ type: "gift" }))
      toast.success(`Bonus starter ${coins(STARTER_GIFT)} diklaim!`, {
        description: "Bonus ini hanya bisa diklaim sekali.",
      });
  };
  const mission = async (id: string) => {
    const missionItem = MISSIONS.find((item) => item.id === id);
    if (
      !missionItem ||
      game.missionsClaimed.includes(id) ||
      missionValue(game, id) < missionItem.target
    )
      return;
    if (await runAction({ type: "mission", id }))
      toast.success(`Misi beres! +${coins(missionItem.reward)}`);
  };
  const claimAll = async () => {
    const total = claimableTotal(game);
    if (total <= 0) return;
    if (game.pending >= 1 && !(await runAction({ type: "claim" }))) return;
    if (!game.rewardClaimed && !(await runAction({ type: "gift" }))) return;
    for (const item of MISSIONS) {
      const ready =
        !game.missionsClaimed.includes(item.id) &&
        missionValue(game, item.id) >= item.target;
      if (ready && !(await runAction({ type: "mission", id: item.id }))) return;
    }
    toast.success(`+${coins(total)} diklaim`, {
      description: "Semua hadiah yang siap sudah masuk saldomu.",
      duration: 2400,
    });
  };
  const withdraw = async (payload: WithdrawPayload) => {
    const next = await runAction({ type: "withdraw", ...payload }, "withdraw");
    if (!next) return false;
    toast.success(`Penarikan ${idr(payload.coins)} dikirim`, {
      description: "Tim Racely memverifikasi dalam 1×24 jam kerja.",
      duration: 2600,
    });
    return true;
  };
  const chooseCircuit = async (circuit: number) => {
    if ((circuit !== 0 && circuit !== 1) || (circuit === 1 && game.laps < 25))
      return;
    if (await runAction({ type: "circuit", circuit })) {
      setDialog(null);
      navigate("race");
      toast.success(
        circuit
          ? "Selamat datang di Midnight Speedway!"
          : "Kembali ke Jakarta Raceway",
      );
    }
  };
  const boost = async () => {
    if (game.cooldown > 0) return;
    if (await runAction({ type: "boost" }))
      toast.success("Gaspol! Kecepatan 2× selama 10 detik.", {
        duration: 1800,
      });
  };
  const chooseColor = async (
    color: "#4275ff" | "#f4b65b" | "#e9eef7",
    name: string,
  ) => {
    if (await runAction({ type: "color", color }, `color:${color}`))
      toast.success(`Bodi ${name} terpasang dan tersimpan`);
  };

  if (!clientReady || (isLoading && !data)) return <BootScreen />;
  if (error && !data) {
    return (
      <GameGate
        error={error}
        onRetry={initData ? () => void mutate() : undefined}
      />
    );
  }

  return (
    <div className="game-shell">
      <Toaster theme="dark" position="top-center" />
      <GameNavigation
        tab={tab}
        onTab={navigate}
        giftAvailable={!game.rewardClaimed}
      />
      <div className="main-shell">
        <Topbar
          tab={tab}
          balance={game.balance}
          level={totalLevel(game)}
          racerName={game.player.name}
          onWallet={() => navigate("wallet")}
          onHelp={() => setDialog("help")}
        />
        <main className="page-content" aria-busy={Boolean(busyAction)}>
          <div className="page-heading">
            <h1 id="page-title" tabIndex={-1} className="text-balance">{TITLES[tab]}</h1>
            <div className="flex items-center gap-1">
              {tab === "race" && (
                <InfoHint title="Balapan & kamera">
                  Mobil melaju otomatis melawan 2 bot latihan. Gaspol menggandakan kecepatan selama 10 detik, lalu isi ulang 25 detik. Geser arena untuk orbit, cubit untuk zoom, atau ketuk ikon kamera.
                </InfoHint>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => setDialog("help")} aria-label="Cara bermain">
                <CircleHelp aria-hidden="true" />
              </Button>
            </div>
          </div>
          {raceMounted && (
            <div
              className={cn("dashboard-grid", tab !== "race" ? "tab-offstage" : "section-enter")}
              inert={tab !== "race"}
            >
              <div className="main-column">
                <RacePanel
                  game={game}
                  active={tab === "race"}
                  onBoost={boost}
                  onCircuits={() => setDialog("circuits")}
                  disabled={Boolean(busyAction)}
                />
                <RaceReward
                  pending={game.pending}
                  onClaim={claim}
                  disabled={Boolean(busyAction)}
                />
                <CircuitPanel
                  game={game}
                  onChoose={chooseCircuit}
                  disabled={Boolean(busyAction)}
                />
              </div>
            </div>
          )}
          {garageMounted && (
            <div
              className={cn("garage-layout", tab !== "garage" ? "tab-offstage" : "section-enter")}
              inert={tab !== "garage"}
            >
              <GaragePanel
                game={game}
                active={tab === "garage"}
                onChooseColor={chooseColor}
                disabled={Boolean(busyAction)}
              />
              <UpgradePanel game={game} onUpgrade={upgrade} disabled={Boolean(busyAction)} />
            </div>
          )}
          {tab === "race" || tab === "garage" ? null : tab === "menu" ? (
            <MenuPanel
              onNavigate={navigate}
              onCircuits={() => setDialog("circuits")}
              onWallet={() => navigate("wallet")}
              onHelp={() => setDialog("help")}
              giftAvailable={!game.rewardClaimed}
            />
          ) : tab === "wallet" ? (
            <WalletPanel
              game={game}
              onWithdraw={withdraw}
              disabled={Boolean(busyAction)}
            />
          ) : (
            <RewardsPanel
              game={game}
              onClaimRace={claim}
              onClaimGift={gift}
              onClaimMission={mission}
              onClaimAll={claimAll}
              disabled={Boolean(busyAction)}
            />
          )}
        </main>
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "circuits"
                ? "Pilih tempat ngegas"
                : "Mobil kecil. Langsung jalan."}
            </DialogTitle>
            <DialogDescription>
              {dialog === "circuits"
                ? "Selesaikan putaran untuk membuka lintasan baru."
                : "Racely adalah game mini 4WD 3D independen dan tidak berafiliasi dengan produsen kendaraan atau mainan mana pun."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "circuits" ? (
            <div className="flex flex-col gap-3">
              <Button
                variant="circuit"
                disabled={Boolean(busyAction)}
                onClick={() => chooseCircuit(0)}
              >
                Jakarta Raceway
                {game.circuit === 0 && <Check data-icon="inline-end" />}
              </Button>
              <Button
                variant="circuit"
                disabled={Boolean(busyAction) || game.laps < 25}
                onClick={() => chooseCircuit(1)}
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
    </div>
  );
}
