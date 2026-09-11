"use client";

import Image from "next/image";
import { memo } from "react";
import {
  ArrowUp,
  BatteryMedium,
  Check,
  Cog,
  Gauge,
  ChevronRight,
  CircleDot,
  Zap,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  lapReward,
  lapSeconds,
  totalLevel,
  upgradeCost,
  rupiah,
  type GameState,
  type Upgrade,
} from "@/lib/game";

export const PARTS = [
  {
    key: "engine" as Upgrade,
    title: "Mesin",
    subtitle: "+15% tenaga dasar",
    icon: Cog,
  },
  {
    key: "tires" as Upgrade,
    title: "Ban & roller",
    subtitle: "+10% tenaga dasar",
    icon: CircleDot,
  },
  {
    key: "battery" as Upgrade,
    title: "Baterai",
    subtitle: "+Rp100 / putaran",
    icon: BatteryMedium,
  },
];

export const GaragePanel = memo(
  function GaragePanel({
    game,
    onOpen,
  }: {
    game: GameState;
    onOpen?: () => void;
  }) {
    return (
      <section className="panel garage-panel">
        <div className="panel-heading">
          <h2>
            <Wrench size={15} />
            Mobil kamu
          </h2>
          {onOpen ? (
            <button onClick={onOpen}>
              Garasi
              <ChevronRight size={14} />
            </button>
          ) : (
            <span className="eyebrow">SUPER-II</span>
          )}
        </div>
        <div className="car-showcase">
          <span className="car-edition">01 / NEO SERIES</span>
          <Image
            src="/images/neo-falcon.png"
            sizes="(max-width: 760px) 100vw, 420px"
            width={1024}
            height={1024}
            alt="Neo Falcon biru dengan ban hitam dan roller emas, foto katalog"
            className="car-image"
          />
          <span className="equipped-tag">
            <Check size={10} />
            TERPASANG
          </span>
        </div>
        <div className="car-identity">
          <div>
            <h3>
              Neo Falcon<span>01</span>
            </h3>
            <p>Super-II chassis · Mini 4WD</p>
          </div>
          <Badge variant="secondary">LV. {totalLevel(game)}</Badge>
        </div>
        <div className="garage-stats">
          <span>
            <Gauge size={14} />
            <strong>
              {(192 / lapSeconds({ ...game, boostLeft: 0 })).toFixed(1)}
            </strong>{" "}
            km/j
          </span>
          <span>
            <Zap size={14} />
            <strong>{lapReward(game)}</strong> koin/lap
          </span>
          <span
            className="active-color"
            style={{ background: game.color }}
            title="Warna bodi aktif"
          />
        </div>
      </section>
    );
  },
  (a, b) =>
    a.game.levels === b.game.levels &&
    a.game.color === b.game.color &&
    a.game.circuit === b.game.circuit &&
    Boolean(a.onOpen) === Boolean(b.onOpen),
);

export function UpgradePanel({
  game,
  onUpgrade,
  disabled = false,
}: {
  game: GameState;
  onUpgrade: (key: Upgrade) => void;
  disabled?: boolean;
}) {
  const baseSeconds = lapSeconds({ ...game, boostLeft: 0 });
  return (
    <section className="panel upgrade-panel">
      <div className="panel-heading">
        <h2>Upgrade performa</h2>
        <span className="eyebrow">PIT STOP</span>
      </div>
      <p className="upgrade-intro">Racik lebih kencang. Raih lebih banyak.</p>
      <div className="upgrade-list">
        {PARTS.map(({ key, title, icon: Icon }) => {
          const level = game.levels[key];
          const max = level >= 10;
          const cost = upgradeCost(key, level);
          const affordable = game.balance >= cost;
          const next = {
            ...game,
            boostLeft: 0,
            levels: { ...game.levels, [key]: level + 1 },
          };
          const benefit =
            key === "battery"
              ? `${rupiah(lapReward(game))} → ${rupiah(lapReward(next))}/lap`
              : `${baseSeconds.toFixed(2)} → ${lapSeconds(next).toFixed(2)} detik/lap`;
          return (
            <div key={key} className="upgrade-row">
              <div className="upgrade-icon">
                <Icon size={20} />
              </div>
              <div className="upgrade-info">
                <div className="upgrade-name">
                  <h3>{title}</h3>
                  <span key={level} className="level-label">
                    LV. {level}
                  </span>
                </div>
                <p>{max ? "Performa maksimal" : benefit}</p>
                <div
                  className="level-segments"
                  aria-label={`Level ${level} dari 10`}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <span
                      key={i}
                      className={i < level ? "filled" : undefined}
                    />
                  ))}
                </div>
              </div>
              <div className="upgrade-action">
                <button
                  className="upgrade-buy"
                  onClick={() => onUpgrade(key)}
                  disabled={disabled || max || !affordable}
                  aria-label={`Upgrade ${title}, ${rupiah(cost)} virtual`}
                  title={
                    max
                      ? "Level maksimal"
                      : !affordable
                        ? `Butuh ${rupiah(cost - game.balance)} koin lagi`
                        : benefit
                  }
                >
                  {max ? <Check size={15} /> : <ArrowUp size={14} />}
                  {max ? "MAX" : rupiah(cost)}
                </button>
                {!max && !affordable && (
                  <span>Kurang {rupiah(cost - game.balance)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="upgrade-foot">
        <Zap size={12} />
        Langsung aktif. Tidak perlu pit-in.
      </div>
    </section>
  );
}
