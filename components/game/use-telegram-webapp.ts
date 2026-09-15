"use client";

import { useEffect, useState } from "react";
import { referralShareText } from "@/lib/game";

type SafeAreaInsets = { top: number; bottom: number; left: number; right: number };

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  platform: string;
  initData: string;
  isVersionAtLeast: (version: string) => boolean;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  safeAreaInset?: SafeAreaInsets;
  contentSafeAreaInset?: SafeAreaInsets;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  HapticFeedback?: { impactOccurred: (style: "light" | "medium") => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const fullscreenRequested = new WeakSet<TelegramWebApp>();
const viewportEvents = [
  "safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged",
  "fullscreenFailed", "viewportChanged", "activated",
];

/** Native chrome changes independently of React, including while minimized. */
export function connectTelegramViewport(app: TelegramWebApp, root: HTMLElement) {
  const syncViewport = () => {
    root.dataset.telegramFullscreen = String(Boolean(app.isFullscreen));
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      for (const [kind, insets] of [["device", app.safeAreaInset], ["content", app.contentSafeAreaInset]] as const) {
        const value = insets?.[edge];
        const property = `--racely-${kind}-inset-${edge}`;
        if (typeof value === "number" && Number.isFinite(value)) {
          root.style.setProperty(property, `${Math.max(0, value)}px`);
        } else {
          root.style.removeProperty(property);
        }
      }
    }
  };

  syncViewport();
  for (const event of viewportEvents) app.onEvent?.(event, syncViewport);
  if (app.isVersionAtLeast("8.0") && app.requestFullscreen && !app.isFullscreen && !fullscreenRequested.has(app)) {
    fullscreenRequested.add(app);
    try {
      app.requestFullscreen();
    } catch {
      // Unsupported desktop/web clients must still load the game normally.
      syncViewport();
    }
  }

  return () => {
    for (const event of viewportEvents) app.offEvent?.(event, syncViewport);
    delete root.dataset.telegramFullscreen;
    for (const kind of ["device", "content"]) {
      for (const edge of ["top", "bottom", "left", "right"]) {
        root.style.removeProperty(`--racely-${kind}-inset-${edge}`);
      }
    }
  };
}

/**
 * Reads the signed initData the Mini App was opened with and tells the caller
 * when it is safe to start fetching. `clientReady` flips even outside Telegram
 * so the preview session still loads: an empty initData is what the server
 * treats as "no Telegram identity", not an error to wait on.
 */
export function useTelegramWebApp() {
  const [initData, setInitData] = useState("");
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    let disconnectViewport: (() => void) | undefined;
    if (app && app.platform !== "unknown") {
      const root = document.documentElement;
      const shellColor = getComputedStyle(root).getPropertyValue("--background").trim();
      if (app.isVersionAtLeast("6.9")) {
        app.setHeaderColor(shellColor);
        app.setBackgroundColor(shellColor);
      }
      if (app.isVersionAtLeast("7.10")) app.setBottomBarColor?.(shellColor);
      disconnectViewport = connectTelegramViewport(app, root);
      app.expand();
      app.ready();
      // Telegram injects initData before hydration; this establishes the client session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitData(app.initData ?? "");
    }
    setClientReady(true);
    return disconnectViewport;
  }, []);

  return { initData, clientReady };
}

export type ReferralShareResult = "telegram" | "shared" | "copied" | "cancelled";

export async function shareReferralLink(
  link: string,
  inviterName: string,
  inviteeReward: number,
): Promise<ReferralShareResult> {
  const text = referralShareText(inviterName, inviteeReward);
  const app = window.Telegram?.WebApp;
  if (app?.platform !== "unknown" && app?.openTelegramLink) {
    try {
      const shareUrl = new URL("https://t.me/share/url");
      shareUrl.searchParams.set("url", link);
      shareUrl.searchParams.set("text", text);
      app.openTelegramLink(shareUrl.toString());
      return "telegram";
    } catch {
      // Klien Telegram lama turun ke mekanisme berbagi browser di bawah.
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: "Racely", text, url: link });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  await navigator.clipboard.writeText(`${text}\n${link}`);
  return "copied";
}

/** No-op outside Telegram and on clients older than 6.1. */
export function telegramHaptic() {
  const app = window.Telegram?.WebApp;
  if (app?.isVersionAtLeast("6.1")) app.HapticFeedback?.impactOccurred("light");
}
