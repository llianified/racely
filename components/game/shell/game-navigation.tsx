"use client";

import {
  Flag,
  Warehouse,
  Gift,
  Coins,
  Menu,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCoins } from "@/lib/game";
import { useCountUp } from "./use-count-up";

export type GameTab = "menu" | "race" | "garage" | "rewards" | "wallet" | "referral" | "leaderboard";
/** Tab yang tidak punya tombol di nav bawah; dibuka dari Menu dan menyorot "Menu" saat aktif. */
const MENU_CHILD_TABS: ReadonlySet<GameTab> = new Set(["referral", "leaderboard"]);
export const NAV_ITEMS = [
  { id: "menu" as const, label: "Menu", icon: Menu },
  { id: "race" as const, label: "Balapan", icon: Flag },
  { id: "garage" as const, label: "Garasi", icon: Warehouse },
  { id: "rewards" as const, label: "Hadiah", icon: Gift },
  { id: "wallet" as const, label: "Dompet", icon: Wallet },
];
export function Brand() {
  return (
    <div className="brand">
      <Image
        src="/racely-logo.png"
        alt=""
        width={372}
        height={248}
        sizes="32px"
        className="brand-mark"
      />
      <div className="brand-word">RACELY<span aria-hidden="true">.</span></div>
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
  const activeTab: GameTab = MENU_CHILD_TABS.has(tab) ? "menu" : tab;
  const items = NAV_ITEMS.map(({ id, label, icon: Icon }) => (
    <button
      key={id}
      onClick={() => onTab(id)}
      className={cn("nav-item", activeTab === id && "active")}
      aria-current={activeTab === id ? "page" : undefined}
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
  racerPhotoUrl,
  onWallet,
  onHelp,
}: {
  tab: GameTab;
  balance: number;
  level: number;
  racerName: string;
  racerPhotoUrl: string | null;
  onWallet: () => void;
  onHelp: () => void;
}) {
  const initial = Array.from(racerName.trim())[0]?.toUpperCase() || "R";
  const settledBalance = Math.floor(balance);
  const displayedBalance = formatCoins(settledBalance);
  // Saldo digulirkan supaya koin yang masuk terlihat masuk. Label tombolnya
  // tetap memakai nilai akhir -- pembaca layar tidak perlu ikut menonton.
  const animatedBalance = formatCoins(useCountUp(settledBalance));
  // Foto yang gagal dimuat harus JATUH KE inisial, bukan menyisakan ikon gambar
  // rusak di pojok atas -- satu-satunya potret pemain di seluruh layar. Gagalnya
  // bisa karena apa saja di luar kendali kami: foto yang sudah dihapus di
  // Telegram, atau jaringan yang putus tepat saat avatar diambil.
  // Yang disimpan URL-nya, bukan sebuah boolean: foto berikutnya harus dicoba
  // lagi dari nol, dan menyimpan URL membuat itu terjadi sendirinya tanpa efek
  // yang menyetel ulang state.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = Boolean(racerPhotoUrl) && failedPhoto !== racerPhotoUrl;

  return (
    <header className="topbar font-sans">
      <div className="topbar-brand"><Brand /></div>
      <div className="topbar-right">
        <div className="cockpit-identity">
          <span className="cockpit-label">PEMBALAP</span>
          <strong className="cockpit-name" title={racerName}>{racerName}</strong>
        </div>
        <button
          type="button"
          onClick={onWallet}
          className="coin-balance"
          aria-label={`${displayedBalance} koin. Buka dompet`}
          title="Buka dompet"
        >
          <Coins aria-hidden="true" />
          <span aria-hidden="true">
            <small>Koin</small>
            <strong>{animatedBalance}</strong>
          </span>
        </button>
        <button
          type="button"
          onClick={onHelp}
          className="racer-avatar"
          aria-label={`${racerName}, level ${level}. Cara bermain`}
          title={`${racerName} · Level ${level} · Cara bermain`}
        >
          {showPhoto && racerPhotoUrl ? (
            <Image
              src={racerPhotoUrl}
              alt=""
              width={32}
              height={32}
              sizes="32px"
              className="racer-photo"
              aria-hidden="true"
              onError={() => setFailedPhoto(racerPhotoUrl)}
            />
          ) : (
            <span className="racer-initial" aria-hidden="true">{initial}</span>
          )}
          <span className="racer-level" aria-hidden="true">LV {level}</span>
        </button>
      </div>
    </header>
  );
}
