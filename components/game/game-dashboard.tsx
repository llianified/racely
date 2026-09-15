"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { GameNavigation, Topbar, type GameTab } from "./shell/game-navigation";
import { BootScreen } from "./shell/boot-screen";
import { GameGate } from "./shell/game-gate";
import { GameDialog, type DialogKind } from "./shell/game-dialog";
import { MenuPanel } from "./shell/menu-panel";
import { StarterBonusDialog } from "./shell/starter-bonus-dialog";
import { GaragePanel, UpgradePanel } from "./panels/garage-panel";
import { SetupPanel } from "./panels/setup-panel";
import { RewardsPanel, claimableTotal } from "./panels/rewards-panel";
import { ReferralPanel } from "./panels/referral-panel";
import { LeaderboardPanel, LeaderboardShortcut } from "./panels/leaderboard-panel";
import { WalletPanel, type WithdrawPayload } from "./panels/wallet-panel";
import { CircuitPanel } from "./race/circuit-panel";
import { AdRewardShortcut, RacePanel, RaceReward } from "./race/race-panel";
import { CarSelection } from "./car/car-selection";
import { ADSGRAM_BLOCK_ID, showRewardedAd } from "./adsgram";
import {
  GameRequestError,
  createGameActionSender,
  isSessionExpired,
  readGameResponse,
  requestHeaders,
  type GameKey,
} from "./game-client";
import {
  shareReferralLink,
  telegramHaptic,
  useTelegramWebApp,
} from "./use-telegram-webapp";
import {
  coins,
  gameReducer,
  INITIAL_GAME,
  missions,
  missionValue,
  totalLevel,
  upgradeCost,
  type GameCommand,
  type GameState,
  type MissionId,
  type OfflineEarnings,
  type Upgrade,
} from "@/lib/game";
import { cn } from "@/lib/utils";
import { CAR_CATALOG, isCarColor, type CarColor, type CarModelId } from "@/lib/car-catalog";
import { GEAR_CATALOG, ROLLER_CATALOG, type GearId, type RollerId } from "@/lib/car-setup";
import { PAINT_CATALOG, type PaintCommand } from "@/lib/car-paints";
import type { DailyMissionKind } from "@/lib/daily-missions";
import { PART_CATALOG, SLOT_LABELS, type PartCommand } from "@/lib/car-parts";
import { circuitUnlockLaps } from "@/lib/economy-config";
import { circuitName } from "@/lib/track-layout";

const GAME_TOAST_OFFSET = {
  bottom: "calc(var(--nav-height) + var(--safe-bottom) + var(--space-md))",
} as const;

export function GameDashboard() {
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME);
  const [tab, setTab] = useState<GameTab>("race");
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [welcomeBack, setWelcomeBack] = useState<OfflineEarnings | null>(null);
  const [starterDismissed, setStarterDismissed] = useState(false);
  const [starterClaimActive, setStarterClaimActive] = useState(false);
  const [starterClaimFailed, setStarterClaimFailed] = useState(false);
  const starterOpen = !starterDismissed && (!game.rewardClaimed || starterClaimActive);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Terpisah dari busyAction: selama iklan diputar belum ada permintaan ke
  // server, tapi tombol iklan lain harus ikut terkunci.
  const [adPlaying, setAdPlaying] = useState(false);
  const [sendAction] = useState(createGameActionSender);
  const [raceMounted, setRaceMounted] = useState(false);
  const [garageMounted, setGarageMounted] = useState(false);
  // Lembar modifikasi dan toko aero masing-masing membawa panggung 3D sendiri.
  // Selama salah satunya terbuka, panggung garasi di belakangnya melepas
  // context-nya: dua context WebGL hidup bersamaan adalah persis kondisi yang
  // membunuh renderer WebView Telegram di perangkat kelas bawah -- "This page
  // couldn't load", bukan context loss yang bisa ditangkap. Dihitung, bukan
  // boolean, supaya sheet yang menutup tidak mematikan tanda milik sheet lain
  // yang baru terbuka.
  const [previewSheets, setPreviewSheets] = useState(0);
  const trackPreviewSheet = useCallback(
    (open: boolean) =>
      setPreviewSheets((count) => Math.max(0, count + (open ? 1 : -1))),
    [],
  );
  const { initData, clientReady } = useTelegramWebApp();
  const synced = useRef(false);
  const bootstrapped = useRef(false);
  const mutationLocked = useRef(false);
  const navigationTarget = useRef<string | null>(null);
  const expired = useRef(false);
  const welcomeShown = useRef<OfflineEarnings | null>(null);

  useEffect(() => {
    const targetId = navigationTarget.current;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    navigationTarget.current = null;
    target.focus({ preventScroll: true });
    if (targetId !== "page-content") target.scrollIntoView({ block: "start" });
  }, [tab, garageMounted]);

  useEffect(() => {
    if (raceMounted) return;
    if (tab === "race") {
      // Mounting the WebGL arena is the side effect; raceMounted is a latch that
      // only ever flips false -> true, so this cannot cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRaceMounted(true);
      return;
    }
    // Warm the arena off-stage so the first switch to Balapan has nothing left to build.
    const idle = window.setTimeout(() => setRaceMounted(true), 1500);
    return () => window.clearTimeout(idle);
  }, [tab, raceMounted]);

  useEffect(() => {
    if (garageMounted || tab !== "garage") return;
    // Mount on the first visit only, then keep the WebGL context alive off-stage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGarageMounted(true);
  }, [tab, garageMounted]);

  const gameKey = clientReady ? (["/api/game", initData] as const) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<GameState>(
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
      refreshInterval: (latest) => latest?.carSelection?.model === null || mutationLocked.current ? 0 : 5000,
      refreshWhenHidden: false,
      revalidateOnFocus: game.carSelection?.model !== null,
      isPaused: () => mutationLocked.current || expired.current,
      dedupingInterval: 1000,
      // A rejected initData will be rejected again: retrying only burns the
      // player's rate-limit bucket until they reopen the app from Telegram.
      shouldRetryOnError: (retryError) => !isSessionExpired(retryError),
    },
  );

  useEffect(() => {
    if (!data) return;
    synced.current = true;
    dispatch({ type: "hydrate", state: data });
  }, [data]);

  useEffect(() => {
    const earnings = data?.offlineEarnings;
    // The server reports an absence on exactly the one response that credited
    // it, so it has to be latched out here before the next sync replaces the
    // state that carried it. The latch holds that payload, not a boolean: a
    // Telegram Mini App keeps its webview alive across visits, so a player who
    // leaves and comes back five times a day has five absences to be told
    // about. A boolean showed the first and silently swallowed the rest --
    // the offline payout, the whole point of the feature, went invisible after
    // one dialog. Each fetch builds a fresh object, so identity is what
    // separates a new absence from a re-render of the one already shown.
    if (!earnings || earnings.coins <= 0 || welcomeShown.current === earnings)
      return;
    welcomeShown.current = earnings;
    setWelcomeBack(earnings);
  }, [data]);

  const sessionExpired = isSessionExpired(error);

  // isPaused() reads a ref because SWR calls it outside the render pass.
  useEffect(() => {
    expired.current = sessionExpired;
  }, [sessionExpired]);

  useEffect(() => {
    if (sessionExpired) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (synced.current && !document.hidden)
        dispatch({ type: "tick", delta: (now - last) / 1000 });
      last = now;
    }, 100);
    return () => clearInterval(id);
  }, [sessionExpired]);

  const navigate = (next: GameTab, target?: string) => {
    const targetId = target ?? "page-content";
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

  const runAction = async (
    action: GameCommand,
    actionKey: string = action.type,
  ) => {
    if (mutationLocked.current) return null;
    mutationLocked.current = true;
    setBusyAction(actionKey);
    try {
      const next = await sendAction(action, initData);
      dispatch({ type: "hydrate", state: next });
      await mutate(next, { revalidate: false });
      telegramHaptic();
      return next;
    } catch (cause) {
      // Server sudah mengirim alasannya ("Koin belum cukup…", batas penarikan,
      // 429 "Terlalu banyak aksi…"). Menampilkan "Aksi gagal" untuk semuanya
      // membuang satu-satunya keterangan yang dimiliki pemain.
      toast.error(
        cause instanceof GameRequestError ? cause.message : "Hasil aksi belum terkonfirmasi. Coba lagi dengan aksi yang sama.",
      );
      return null;
    } finally {
      mutationLocked.current = false;
      setBusyAction(null);
    }
  };

  const upgrade = async (key: Upgrade) => {
    if (
      game.levels[key] >= game.economy.maxUpgradeLevel ||
      game.balance < upgradeCost(game, key)
    )
      return false;
    const next = await runAction({ type: "upgrade", key }, `upgrade:${key}`);
    if (next)
      toast.success(
        `${{ engine: "Mesin", tires: "Ban", battery: "Baterai" }[key]} Lv. ${next.levels[key]}`,
      );
    return Boolean(next);
  };
  const modifyBodyPart = async (action: PartCommand) => {
    const next = await runAction(action);
    if (!next) return false;
    toast.success(action.type === "unequip-part"
      ? `${SLOT_LABELS[action.slot]} bawaan`
      : `${PART_CATALOG[action.partId].name} ${action.type === "buy-part" ? "dibeli" : "aktif"}`);
    return true;
  };
  const claim = async () => {
    const amount = Math.floor(game.pending);
    if (amount < 1) return;
    if (await runAction({ type: "claim" }))
      toast.success(`+${coins(amount)} ke saldo`);
  };
  const daily = async () => {
    if (game.daily.claimedToday) return;
    const amount = game.daily.reward;
    if (await runAction({ type: "daily" }))
      toast.success(`Harian +${coins(amount)}`);
  };
  const watchAd = async () => {
    if (!game.adReward.available || adPlaying || busyAction) return;
    const amount = game.adReward.reward;
    setAdPlaying(true);
    try {
      // Block tes Adsgram hanya tayang dengan debug di luar Telegram, jadi mode
      // preview memakainya; di produksi debug harus mati agar tayangan tercatat.
      const result = await showRewardedAd({ debug: Boolean(game.developmentPreview) });
      if (result === "rewarded") {
        if (await runAction({ type: "watch-ad" })) toast.success(`Bonus iklan +${coins(amount)}`);
      } else if (result === "skipped") {
        toast.error("Iklan ditutup sebelum selesai; bonus belum diberikan.");
      } else if (result === "error") {
        toast.error("Iklan gagal dimuat. Coba lagi sebentar.");
      } else {
        toast.error("Iklan belum tersedia saat ini.");
      }
    } finally {
      setAdPlaying(false);
    }
  };
  const invite = async () => {
    const link = game.referral.link;
    if (!link) return;
    try {
      const result = await shareReferralLink(
        link,
        game.player.name,
        game.economy.referralRewardInvitee,
      );
      if (result === "cancelled") return;
      telegramHaptic();
      toast.success(
        result === "copied" ? "Ajakan disalin" : "Ajakan siap dibagikan",
      );
    } catch {
      toast.error("Ajakan gagal dibagikan");
    }
  };
  const gift = async () => {
    if (game.rewardClaimed) return;
    if (await runAction({ type: "gift" }))
      toast.success(`Starter +${coins(game.economy.starterGift)}`);
  };
  const mission = async (id: MissionId) => {
    const missionItem = missions(game.economy).find((item) => item.id === id);
    if (
      !missionItem ||
      game.missionsClaimed.includes(id) ||
      missionValue(game, id) < missionItem.target
    )
      return;
    if (await runAction({ type: "mission", id }))
      toast.success(`Misi +${coins(missionItem.reward)}`);
  };
  const modifyPaint = async (action: PaintCommand) => {
    const next = await runAction(action);
    if (!next) return false;
    toast.success(`${PAINT_CATALOG[action.paintId].name} ${action.type === "buy-paint" ? "dibeli; pasang dari koleksi" : "terpasang"}`);
    return true;
  };
  // Ganti mobil dari garasi. Warna ikut yang sedang dipakai supaya perintahnya
  // sama dengan yang dikirim layar pemilihan mobil.
  const switchCar = async (model: CarModelId) => {
    // Server hanya menerima warna dari palet model tujuan, jadi cat yang tidak
    // ada di sana jatuh ke warna bawaan mobil itu.
    const color = isCarColor(model, game.color) ? game.color : CAR_CATALOG[model].defaultColor;
    const next = await runAction({ type: "select-car", model, color }, `select-car:${model}`);
    if (!next) return false;
    toast.success(`${CAR_CATALOG[model].name} dipakai`);
    return true;
  };
  const dailyMission = async (day: string, kind: DailyMissionKind) => {
    if (await runAction({ type: "daily-mission", day, kind })) toast.success("Misi harian diklaim");
  };
  const claimAll = async () => {
    const total = claimableTotal(game);
    if (total <= 0) return;
    if (game.pending >= 1 && !(await runAction({ type: "claim" }))) return;
    if (!game.daily.claimedToday && !(await runAction({ type: "daily" }))) return;
    if (!game.rewardClaimed && !(await runAction({ type: "gift" }))) return;
    for (const item of missions(game.economy)) {
      const ready =
        !game.missionsClaimed.includes(item.id) &&
        missionValue(game, item.id) >= item.target;
      if (ready && !(await runAction({ type: "mission", id: item.id }))) return;
    }
    if (game.dailyMissions) {
      for (const item of game.dailyMissions.items) {
        if (!item.claimed && game.dailyMissions.values[item.kind] >= item.target &&
          !(await runAction({ type: "daily-mission", day: game.dailyMissions.day, kind: item.kind }))) return;
      }
    }
    toast.success("Hadiah siap berhasil diklaim");
  };
  const withdraw = async (payload: WithdrawPayload) => {
    const next = await runAction({ type: "withdraw", ...payload }, "withdraw");
    if (!next) return false;
    toast.success("Penarikan dikirim");
    return true;
  };
  const chooseCircuit = async (circuit: number) => {
    // Ambangnya dari config PER SIRKUIT, sama seperti panel dan dialog sirkuit.
    // Literal di sini membuat tombol yang ditawarkan dialog diam-diam tidak
    // melakukan apa pun begitu ambangnya disetel lain lewat /admin -- dan
    // mengunci pemain di trek kedua walau trek ketiga sudah terbuka.
    if (game.circuit >= circuit || game.laps < circuitUnlockLaps(game.economy, circuit))
      return;
    if (await runAction({ type: "circuit", circuit })) {
      setDialog(null);
      navigate("race");
      toast.success(`${circuitName(circuit)} aktif`);
    }
  };
  const chooseSetup = async (gear: GearId, roller: RollerId) => {
    if (
      await runAction({ type: "set-setup", gear, roller }, `setup:${gear}:${roller}`)
    ) {
      toast.success(`${GEAR_CATALOG[gear].name} · ${ROLLER_CATALOG[roller].name}`);
    }
  };
  const chooseColor = async (
    color: CarColor,
    name: string,
  ) => {
    if (await runAction({ type: "color", color }, `color:${color}`))
      toast.success(`${name} aktif`);
  };

  if (!clientReady || (isLoading && !data && !error)) return <BootScreen />;
  if (sessionExpired || (error && !data)) {
    return (
      <GameGate
        error={error}
        retrying={isValidating}
        onRetry={initData && !sessionExpired ? () => void mutate().catch(() => undefined) : undefined}
      />
    );
  }

  // synced.current is set in the same effect that dispatches "hydrate", so the
  // dispatch -- not the ref -- is what re-renders us past this gate. Reading it
  // here only avoids one frame of INITIAL_GAME leaking into the dashboard.
  // eslint-disable-next-line react-hooks/refs
  if (!data || !synced.current) return <BootScreen />;
  if (game.carSelection?.model === null) {
    return (
      <>
        <Toaster theme="dark" />
        <CarSelection
          developmentPreview={Boolean(game.developmentPreview)}
          returningPlayer={game.carSelection.returningPlayer}
          initialColor={game.color}
          saving={busyAction === "select-car"}
          onConfirm={async (model, color) => Boolean(await runAction({ type: "select-car", model, color }))}
        />
      </>
    );
  }

  return (
    <div className="game-shell">
      <Toaster
        theme="dark"
        offset={GAME_TOAST_OFFSET}
        mobileOffset={GAME_TOAST_OFFSET}
      />
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
          racerPhotoUrl={game.player.photoUrl}
          onWallet={() => navigate("wallet")}
          onHelp={() => setDialog("help")}
        />
        <main id="page-content" tabIndex={-1} className="page-content" aria-busy={Boolean(busyAction)}>
          {raceMounted && (
            <div
              className={cn("dashboard-grid", tab !== "race" ? "tab-offstage" : "section-enter")}
              inert={tab !== "race"}
            >
              <div className="main-column">
                <RacePanel
                  game={game}
                  active={tab === "race"}
                  onCircuits={() => setDialog("circuits")}
                />
                <div className="race-earnings" role="group" aria-label="Pendapatan balapan dan bonus">
                  <RaceReward
                    pending={game.pending}
                    claiming={busyAction === "claim"}
                    onClaim={claim}
                    disabled={Boolean(busyAction)}
                  />
                  {ADSGRAM_BLOCK_ID && game.adReward.dailyCap > 0 && (
                    <AdRewardShortcut
                      ad={game.adReward}
                      playing={adPlaying}
                      onWatch={watchAd}
                      disabled={Boolean(busyAction) || adPlaying}
                    />
                  )}
                </div>
                <LeaderboardShortcut
                  initData={initData}
                  active={tab === "race"}
                  onOpen={() => navigate("leaderboard")}
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
                previewSheetOpen={previewSheets > 0}
                onPreviewSheet={trackPreviewSheet}
                onChooseColor={chooseColor}
                onPartAction={modifyBodyPart}
                onPaintAction={modifyPaint}
                onSelectCar={switchCar}
                onOpenReferral={() => navigate("referral")}
                disabled={Boolean(busyAction)}
              />
              <UpgradePanel
                game={game}
                onUpgrade={upgrade}
                onPreviewSheet={trackPreviewSheet}
                disabled={Boolean(busyAction)}
              />
              <SetupPanel
                game={game}
                onSetup={chooseSetup}
                disabled={Boolean(busyAction)}
              />
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
          ) : tab === "leaderboard" ? (
            <LeaderboardPanel
              initData={initData}
              onRace={() => navigate("race")}
              onInvite={() => navigate("referral")}
            />
          ) : tab === "referral" ? (
            <ReferralPanel
              game={game}
              onInvite={invite}
              onOpenGarage={(target) => navigate("garage", target)}
              disabled={Boolean(busyAction)}
            />
          ) : (
            <RewardsPanel
              game={game}
              onClaimRace={claim}
              onClaimDaily={daily}
              onClaimGift={gift}
              onClaimMission={mission}
              onClaimDailyMission={dailyMission}
              onClaimAll={claimAll}
              onWatchAd={watchAd}
              adAvailable={Boolean(ADSGRAM_BLOCK_ID)}
              adBusy={adPlaying}
              disabled={Boolean(busyAction)}
            />
          )}
        </main>
      </div>
      <StarterBonusDialog
        open={starterOpen}
        amount={game.economy.starterGift}
        claimed={game.rewardClaimed}
        busy={Boolean(busyAction)}
        failed={starterClaimFailed}
        onClaim={async () => {
          if (game.rewardClaimed || busyAction) return;
          setStarterClaimActive(true);
          setStarterClaimFailed(false);
          const next = await runAction({ type: "gift" });
          if (!next) {
            setStarterClaimActive(false);
            setStarterClaimFailed(true);
          }
        }}
        onClose={() => setStarterDismissed(true)}
        onGarage={() => {
          setStarterDismissed(true);
          navigate("garage");
        }}
      />
      <GameDialog
        kind={starterOpen ? null : welcomeBack ? "welcome" : dialog}
        onClose={() => {
          setWelcomeBack(null);
          setDialog(null);
        }}
        game={game}
        offline={welcomeBack}
        onChooseCircuit={chooseCircuit}
        disabled={Boolean(busyAction)}
      />
    </div>
  );
}
