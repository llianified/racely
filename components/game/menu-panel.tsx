"use client";

import {
  ArrowUpRight, ChevronDown, ChevronRight, CircleHelp, ClipboardList,
  Coins, Flag, Gift, Gauge, MapPinned, Paintbrush, ShieldCheck,
  Trophy, Warehouse, Wrench, Zap,
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
        { label: "Upgrade performa", icon: Wrench, action: () => onNavigate("garage", "upgrades") },
        { label: "Warna bodi", icon: Paintbrush, action: () => onNavigate("garage", "body-colors") },
      ],
    },
    {
      title: "Hadiah & Misi", icon: Trophy,
      items: [
        { label: "Misi sesi ini", icon: ClipboardList, action: () => onNavigate("missions") },
        { label: "Hasil balapan", icon: Coins, action: () => onNavigate("rewards") },
        { label: "Bonus starter", icon: Gift, action: () => onNavigate("rewards", "starter-gift"), badge: giftAvailable ? "KLAIM" : "DIKLAIM" },
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
                  <ItemIcon aria-hidden="true" />
                  <span>{label}</span>
                  {badge ? <Badge variant="secondary">{badge}</Badge> : <ChevronRight className="menu-item-arrow" aria-hidden="true" />}
                </Button>
              ))}
            </div>
          </details>
        ))}
        <Button variant="menuDirect" onClick={onWallet}>
          <Coins aria-hidden="true" /><span>Koin virtual</span><ArrowUpRight aria-hidden="true" />
        </Button>
        <Button variant="menuDirect" onClick={onHelp}>
          <CircleHelp aria-hidden="true" /><span>Cara bermain</span><ArrowUpRight aria-hidden="true" />
        </Button>
      </div>
      <p className="menu-note"><ShieldCheck aria-hidden="true" />Balapan untuk seru-seruan. Tanpa uang sungguhan.</p>
    </section>
  );
}
