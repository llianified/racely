"use client";

import { useState } from "react";
import { BootScreen } from "@/components/game/shell/boot-screen";
import { ChannelGate } from "@/components/game/shell/channel-gate";
import { GameGate } from "@/components/game/shell/game-gate";
import GameError from "@/app/error";
import GlobalError from "@/app/global-error";

export default function GateDesignCheck() {
  const [screen, setScreen] = useState("channel");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState(0);
  const check = () => {
    setBusy(true);
    setChecks((value) => value + 1);
    window.setTimeout(() => setBusy(false), 3000);
  };
  const error = new Error("Progres belum bisa dimuat. Periksa koneksi internetmu, lalu coba lagi.");
  if (process.env.NODE_ENV === "production") return null;
  return (
    <>
      {screen === "channel" && <ChannelGate checking={busy} onCheck={check} />}
      {screen === "telegram" && <GameGate error={new Error("Sesi Telegram tidak valid atau sudah kedaluwarsa. Buka ulang Racely dari @RacelyBot.")} />}
      {screen === "sync" && <GameGate error={error} retrying={busy} onRetry={check} />}
      {screen === "error" && <GameError error={error} reset={check} />}
      {screen === "global" && <GlobalError error={error} reset={check} />}
      {screen === "boot" && <BootScreen />}
      {screen === "overlay" && <BootScreen overlay />}
      <select aria-label="Gate pemeriksaan" value={screen} onChange={(event) => setScreen(event.target.value)}>
        {["channel", "telegram", "sync", "error", "global", "boot", "overlay"].map((value) => <option key={value}>{value}</option>)}
      </select>
      <output aria-label="Jumlah callback">{checks}</output>
    </>
  );
}
