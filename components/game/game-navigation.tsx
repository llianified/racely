"use client";

import {
  Flag,
  Warehouse,
  ClipboardList,
  Gift,
  CircleHelp,
  Coins,
  Zap,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rupiah } from "@/lib/game";

export type GameTab = "race" | "garage" | "missions" | "rewards";
export const NAV_ITEMS = [
  { id: "race" as const, label: "Balapan", icon: Flag },
  { id: "garage" as const, label: "Garasi", icon: Warehouse },
  { id: "missions" as const, label: "Misi", icon: ClipboardList },
  { id: "rewards" as const, label: "Hadiah", icon: Gift },
];
export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <Flag size={22} fill="currentColor" />
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
  onHelp,
  giftAvailable,
}: {
  tab: GameTab;
  onTab: (tab: GameTab) => void;
  onHelp: () => void;
  onWallet: () => void;
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
          <span className="notification-dot" />
        )}
      </span>
      <span>{label}</span>
    </button>
  ));
  return (
    <>
      <aside className="sidebar">
        <button
          className="rail-mark"
          onClick={() => onTab("race")}
          aria-label="Racely, kembali ke balapan"
        >
          <Zap fill="currentColor" />
        </button>
        <nav aria-label="Navigasi utama" className="side-nav">
          {items}
        </nav>
        <button
          className="rail-help"
          onClick={onHelp}
          aria-label="Cara bermain"
        >
          <CircleHelp />
        </button>
        <span className="rail-edition">MINI 4WD</span>
      </aside>
      <nav className="mobile-nav" aria-label="Navigasi mobile">
        {items}
      </nav>
    </>
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
          className="racer-profile"
          aria-label={`${racerName}, level ${level}. Cara bermain`}
        >
          <div className="racer-avatar">
            {initial}
            <span>{level}</span>
          </div>
          <span className="profile-name">
            {racerName}
            <small>Level {level} · Racely racer</small>
          </span>
          <ChevronDown size={14} />
        </button>
      </div>
    </header>
  );
}
