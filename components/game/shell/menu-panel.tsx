"use client";

import {
  ArrowUpRight, ChevronDown, ChevronRight, CircleHelp, ClipboardList,
  Coins, Flag, Gift, Gauge, MapPinned, Paintbrush, ShieldCheck,
  Sparkles, Trophy, UserPlus, Warehouse, Wind, Wrench, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GameTab } from "./game-navigation";

export function MenuPanel({
  onNavigate, onCircuits, onWallet, onHelp, giftAvailable,
}: {
  onNavigate: (tab: GameTab, target?: string) => void;
  onCircuits: () => void;
  onWallet: () => void;
  onHelp: () => void;
  giftAvailable: boolean;
}) {
  const groups = [
    {
      title: "Balapan", icon: Flag,
      items: [
        { label: "Arena balapan", icon: Gauge, action: () => onNavigate("race"), badge: "AUTO" },
        { label: "Pilih sirkuit", icon: MapPinned, action: onCircuits },
      ],
    },
    {
      title: "Garasi", icon: Warehouse,
      items: [
        { label: "Mobil kamu", icon: Zap, action: () => onNavigate("garage") },
        { label: "Koleksi mobil", icon: Sparkles, action: () => onNavigate("garage", "car-collection") },
        { label: "Upgrade performa", icon: Wrench, action: () => onNavigate("garage", "upgrades") },
        { label: "Warna bodi", icon: Paintbrush, action: () => onNavigate("garage", "body-colors") },
        { label: "Aero kit", icon: Wind, action: () => onNavigate("garage", "aero-kit") },
      ],
    },
    {
      title: "Hadiah & Misi", icon: Trophy,
      items: [
        { label: "Semua hadiah", icon: ClipboardList, action: () => onNavigate("rewards") },
        { label: "Hasil balapan", icon: Coins, action: () => onNavigate("rewards", "reward-race") },
        { label: "Bonus starter", icon: Gift, action: () => onNavigate("rewards", "starter-gift"), badge: giftAvailable ? "KLAIM" : "DIKLAIM" },
        { label: "Daftar misi", icon: Trophy, action: () => onNavigate("rewards", "missions") },
      ],
    },
  ];

  return (
    <section className="menu-panel panel section-enter" aria-label="Menu Racely">
      <div className="menu-groups">
        {groups.map(({ title, icon: Icon, items }, index) => (
          <details className="menu-group" key={title} open={index === 0}>
            <summary>
              <Icon aria-hidden="true" />
              <span>{title}</span>
              <span className="menu-chevron"><ChevronDown aria-hidden="true" /></span>
            </summary>
            <div className="menu-items">
              {items.map(({ label, icon: ItemIcon, action, badge }) => (
                <Button variant="menu" key={label} onClick={action}>
                  <ItemIcon data-icon="inline-start" aria-hidden="true" />
                  <span>{label}</span>
                  {badge ? <Badge variant="secondary">{badge}</Badge> : <ChevronRight className="menu-item-arrow" aria-hidden="true" />}
                </Button>
              ))}
            </div>
          </details>
        ))}
        <Button variant="menuDirect" onClick={() => onNavigate("referral")}>
          <UserPlus aria-hidden="true" /><span>Ajak teman</span><ArrowUpRight aria-hidden="true" />
        </Button>
        <Button variant="menuDirect" onClick={onWallet}>
          <Coins aria-hidden="true" /><span>Dompet koin</span><ArrowUpRight aria-hidden="true" />
        </Button>
        <Button variant="menuDirect" onClick={onHelp}>
          <CircleHelp aria-hidden="true" /><span>Cara bermain</span><ArrowUpRight aria-hidden="true" />
        </Button>
      </div>
      <p className="menu-note"><ShieldCheck aria-hidden="true" />Semua hasil balapan dan hadiah dihitung di server Racely.</p>
    </section>
  );
}
