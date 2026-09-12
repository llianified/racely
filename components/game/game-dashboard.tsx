"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { GameNavigation, Topbar, type GameTab } from "./shell/game-navigation";
import { BootScreen } from "./shell/boot-screen";
import { GameGate } from "./shell/game-gate";
import { GameDialog, type DialogKind } from "./shell/game-dialog";
import { MenuPanel } from "./shell/menu-panel";
import { GaragePanel, UpgradePanel } from "./panels/garage-panel";
import { RewardsPanel, claimableTotal } from "./panels/rewards-panel";
import { WalletPanel, type WithdrawPayload } from "./panels/wallet-panel";
import { CircuitPanel } from "./race/circuit-panel";
import { RacePanel, RaceReward } from "./race/race-panel";
import { CarSelection } from "./car/car-selection";
import {
  isSessionExpired,
  readGameResponse,
  requestHeaders,
  type GameKey,
} from "./game-client";
import { telegramHaptic, useTelegramWebApp } from "./use-telegram-webapp";
import {
  coins,
  gameReducer,
  INITIAL_GAME,
  MISSIONS,
  missionValue,
  STARTER_GIFT,
  totalLevel,
  upgradeCost,
  type GameCommand,
  type GameState,
  type OfflineEarnings,
  type Upgrade,
} from "@/lib/game";
import { cn } from "@/lib/utils";
import type { CarColor } from "@/lib/car-catalog";
import { PART_CATALOG, SLOT_LABELS, type PartCommand } from "@/lib/car-parts";

const GAME_TOAST_OFFSET = {
  bottom: "calc(var(--nav-height) + var(--safe-bottom) + var(--space-md))",
} as const;

export function GameDashboard() {
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME);
  const [tab, setTab] = useState<GameTab>("race");
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [welcomeBack, setWelcomeBack] = useState<OfflineEarnings | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [raceMounted, setRaceMounted] = useState(false);
  const [garageMounted, setGarageMounted] = useState(false);
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
      const response = await fetch("/api/game/action", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
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
      telegramHaptic();
      return next;
    } catch {
      toast.error("Aksi gagal");
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
  const invite = async () => {
    const link = game.referral.link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      telegramHaptic();
      toast.success("Link disalin");
    } catch {
      toast.error("Link gagal disalin");
    }
  };
  const gift = async () => {
    if (game.rewardClaimed) return;
    if (await runAction({ type: "gift" }))
      toast.success(`Starter +${coins(STARTER_GIFT)}`);
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
      toast.success(`Misi +${coins(missionItem.reward)}`);
  };
  const claimAll = async () => {
    const total = claimableTotal(game);
    if (total <= 0) return;
    if (game.pending >= 1 && !(await runAction({ type: "claim" }))) return;
    if (!game.daily.claimedToday && !(await runAction({ type: "daily" }))) return;
    if (!game.rewardClaimed && !(await runAction({ type: "gift" }))) return;
    for (const item of MISSIONS) {
      const ready =
        !game.missionsClaimed.includes(item.id) &&
        missionValue(game, item.id) >= item.target;
      if (ready && !(await runAction({ type: "mission", id: item.id }))) return;
    }
    toast.success(`Hadiah +${coins(total)}`);
  };
  const withdraw = async (payload: WithdrawPayload) => {
    const next = await runAction({ type: "withdraw", ...payload }, "withdraw");
    if (!next) return false;
    toast.success("Penarikan dikirim");
    return true;
  };
  const chooseCircuit = async (circuit: 1) => {
    if (game.circuit >= circuit || game.laps < 25) return;
    if (await runAction({ type: "circuit", circuit })) {
      setDialog(null);
      navigate("race");
      toast.success("Midnight aktif");
    }
  };
  const boost = async () => {
    if (game.cooldown > 0) return;
    if (await runAction({ type: "boost" }))
      toast.success("Gaspol 2× aktif");
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
                  onBoost={boost}
                  boosting={busyAction === "boost"}
                  onCircuits={() => setDialog("circuits")}
                  disabled={Boolean(busyAction)}
                />
                <RaceReward
                  pending={game.pending}
                  claiming={busyAction === "claim"}
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
                onPartAction={modifyBodyPart}
                disabled={Boolean(busyAction)}
              />
              <UpgradePanel
                game={game}
                onUpgrade={upgrade}
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
          ) : (
            <RewardsPanel
              game={game}
              onClaimRace={claim}
              onClaimDaily={daily}
              onClaimGift={gift}
              onClaimMission={mission}
              onClaimAll={claimAll}
              onInvite={invite}
              disabled={Boolean(busyAction)}
            />
          )}
        </main>
      </div>
      <GameDialog
        kind={welcomeBack ? "welcome" : dialog}
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
