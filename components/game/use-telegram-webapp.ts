"use client";

import { useEffect, useState } from "react";

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

const SHELL_COLOR = "#090c1d";

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
    if (app && app.platform !== "unknown") {
      app.ready();
      app.expand();
      // window.Telegram.WebApp is injected by an external script and never
      // changes afterwards, so there is nothing to subscribe to -- reading it
      // once on mount is the only way in.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitData(app.initData ?? "");
      if (app.isVersionAtLeast("6.9")) {
        app.setHeaderColor(SHELL_COLOR);
        app.setBackgroundColor(SHELL_COLOR);
      }
    }
    setClientReady(true);
  }, []);

  return { initData, clientReady };
}

/** No-op outside Telegram and on clients older than 6.1. */
export function telegramHaptic() {
  const app = window.Telegram?.WebApp;
  if (app?.isVersionAtLeast("6.1")) app.HapticFeedback?.impactOccurred("light");
}
