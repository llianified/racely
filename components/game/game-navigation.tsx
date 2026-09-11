"use client";

import {
  Flag,
  Warehouse,
  Gift,
  Coins,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rupiah } from "@/lib/game";

export type GameTab = "menu" | "race" | "garage" | "rewards";
export const NAV_ITEMS = [
  { id: "menu" as const, label: "Menu", icon: Menu },
  { id: "race" as const, label: "Balapan", icon: Flag },
  { id: "garage" as const, label: "Garasi", icon: Warehouse },
  { id: "rewards" as const, label: "Hadiah", icon: Gift },
];
export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <Flag size={13} fill="currentColor" />
      </div>
      <div>
        <div className="brand-word">RACELY</div>
        <div className="brand-sub">SMALL SCALE. BIG AMBITION.</div>
      </div>
    </div>
  );
}
export function GameNavigation({
  tab,
  onTab,
  giftAvailable,
}: {
  tab: GameTab;
  onTab: (tab: GameTab) => void;
  giftAvailable: boolean;
}) {
  const items = NAV_ITEMS.map(({ id, label, icon: Icon }) => (
    <button
      key={id}
      onClick={() => onTab(id)}
      className={cn("nav-item", tab === id && "active")}
      aria-current={tab === id ? "page" : undefined}
    >
      <span className="nav-icon">
        <Icon />
        {id === "rewards" && giftAvailable && (
          <><span className="notification-dot" aria-hidden="true" /><span className="sr-only">Bonus tersedia</span></>
        )}
      </span>
      <span>{label}</span>
    </button>
  ));
  return (
    <nav className="mobile-nav" aria-label="Navigasi mobile">
      {items}
    </nav>
  );
}
export function Topbar({
  balance,
  level,
  racerName,
  onWallet,
  onHelp,
}: {
  tab: GameTab;
  balance: number;
  level: number;
  racerName: string;
  onWallet: () => void;
  onHelp: () => void;
}) {
  const initial = racerName.trim().charAt(0).toUpperCase() || "R";
  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-right">
        <button
          onClick={onWallet}
          className="coin-balance"
          aria-label="Lihat koin virtual"
        >
          <Coins />
          <span>
            <strong key={balance}>{rupiah(balance)}</strong>
            <small>KOIN VIRTUAL</small>
          </span>
        </button>
        <button
          onClick={onHelp}
          className="racer-avatar"
          aria-label={`${racerName}, level ${level}. Cara bermain`}
        >
          <span aria-hidden="true">{initial}</span>
          <small aria-hidden="true">{level}</small>
        </button>
      </div>
    </header>
  );
}
