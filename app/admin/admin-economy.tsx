"use client";

import { useMemo, useState, type FormEvent } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/game/panels/info-hint";
import { SectionCardHeading } from "@/components/game/shell/section-card-heading";
import {
  DEFAULT_ECONOMY,
  UPGRADE_LEVEL_CEILING,
  type EconomyConfig,
} from "@/lib/economy-config";
import { projectEconomy } from "@/lib/economy-projection";
import {
  AdminRequestError,
  adminApi,
  decimal,
  rupiah,
  timestamp,
  type EconomySnapshot,
} from "./admin-client";

type NumericKey = Exclude<keyof EconomyConfig, "dailyRewards">;
type Field = { key: NumericKey; label: string; hint?: string; step?: string };
type Group = { legend: string; fields: Field[] };

/**
 * Urutannya mengikuti cara ekonomi disetel sungguhan -- nilai koin lebih dulu,
 * karena itu yang mengubah setiap angka lain menjadi rupiah. Label di sini
 * hanya untuk panel; teks di app pemain tidak bersumber dari sini.
 */
const GROUPS: Group[] = [
  {
    legend: "Nilai koin & penarikan",
    fields: [
      { key: "coinToIdr", label: "Rupiah per koin", step: "1" },
      { key: "minWithdrawCoins", label: "Penarikan minimum", hint: "koin", step: "1" },
      { key: "maxWithdrawCoins", label: "Penarikan maksimum", hint: "koin sekali minta", step: "1" },
    ],
  },
  {
    legend: "Pemain baru",
    fields: [
      { key: "startingBalance", label: "Saldo awal", hint: "koin", step: "1" },
      { key: "starterGift", label: "Bonus starter", hint: "koin", step: "1" },
    ],
  },
  {
    legend: "Putaran",
    fields: [
      { key: "lapBaseSeconds", label: "Detik per putaran", hint: "di level 1", step: "0.1" },
      { key: "lapRewardBase", label: "Koin per putaran", hint: "di level 1", step: "0.01" },
      { key: "lapEnginePerLevel", label: "Laju per level mesin", step: "0.01" },
      { key: "lapTiresPerLevel", label: "Laju per level ban", step: "0.01" },
      { key: "lapRewardPerBattery", label: "Koin per level baterai", step: "0.01" },
      { key: "lapRewardPerCircuit", label: "Koin per tingkat sirkuit", step: "0.01" },
      { key: "racePositionRewardStep", label: "Selisih hadiah per posisi", hint: "P1 +nilai, P3 −nilai", step: "0.05" },
    ],
  },
  {
    legend: "Upgrade",
    fields: [
      { key: "upgradeCostEngine", label: "Biaya dasar mesin", hint: "koin", step: "1" },
      { key: "upgradeCostTires", label: "Biaya dasar ban", hint: "koin", step: "1" },
      { key: "upgradeCostBattery", label: "Biaya dasar baterai", hint: "koin", step: "1" },
      { key: "upgradeCostGrowth", label: "Pengali biaya per level", step: "0.01" },
      {
        key: "maxUpgradeLevel",
        label: "Level maksimum",
        hint: `maks ${UPGRADE_LEVEL_CEILING}`,
        step: "1",
      },
    ],
  },
  {
    legend: "Boost",
    fields: [
      { key: "boostDurationSeconds", label: "Durasi boost", hint: "detik", step: "1" },
      { key: "batteryRechargeSeconds", label: "Isi ulang baterai", hint: "detik", step: "1" },
      { key: "boostMultiplier", label: "Pengali laju boost", step: "0.1" },
    ],
  },
  {
    legend: "Idle",
    fields: [
      { key: "heartbeatCapSeconds", label: "Jendela heartbeat", hint: "detik, bayar penuh", step: "1" },
      { key: "offlineCapSeconds", label: "Jendela offline", hint: "detik", step: "60" },
      { key: "offlineRate", label: "Laju offline", hint: "0–1", step: "0.05" },
    ],
  },
  {
    legend: "Referral",
    fields: [
      { key: "referralMilestoneLaps", label: "Putaran capaian", step: "1" },
      { key: "referralRewardInviter", label: "Hadiah pengajak", hint: "koin", step: "1" },
      { key: "referralRewardInvitee", label: "Hadiah yang diajak", hint: "koin", step: "1" },
    ],
  },
  {
    legend: "Misi & sirkuit",
    fields: [
      { key: "missionLapsTarget", label: "Target misi putaran", step: "1" },
      { key: "missionLapsReward", label: "Hadiah misi putaran", hint: "koin", step: "1" },
      { key: "missionUpgradeTarget", label: "Target misi upgrade", step: "1" },
      { key: "missionUpgradeReward", label: "Hadiah misi upgrade", hint: "koin", step: "1" },
      { key: "missionEarnTarget", label: "Target misi koin", step: "1" },
      { key: "missionEarnReward", label: "Hadiah misi koin", hint: "koin", step: "1" },
      { key: "circuitUnlockLaps", label: "Putaran buka sirkuit 2", step: "1" },
    ],
  },
];

type FormState = Record<NumericKey, string> & { dailyRewards: string };

function toForm(config: EconomyConfig): FormState {
  const draft = {} as FormState;
  for (const group of GROUPS) {
    for (const field of group.fields) draft[field.key] = String(config[field.key]);
  }
  draft.dailyRewards = config.dailyRewards.join(", ");
  return draft;
}

/** Null berarti ada isian yang belum berupa angka -- proyeksi ikut kosong. */
function toConfig(form: FormState): EconomyConfig | null {
  const draft = {} as Record<string, unknown>;
  for (const group of GROUPS) {
    for (const field of group.fields) {
      const value = Number(form[field.key]);
      if (!Number.isFinite(value)) return null;
      draft[field.key] = value;
    }
  }
  const rungs = form.dailyRewards
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  if (rungs.length === 0) return null;
  draft.dailyRewards = rungs;
  return draft as EconomyConfig;
}

export function AdminEconomy({
  snapshot,
  onSaved,
}: {
  snapshot: EconomySnapshot;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(snapshot.config));
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saved = useMemo(() => toForm(snapshot.config), [snapshot.config]);
  const draft = useMemo(() => toConfig(form), [form]);
  const projection = useMemo(() => (draft ? projectEconomy(draft) : null), [draft]);
  const dirtyKeys = useMemo(
    () =>
      (Object.keys(saved) as (keyof FormState)[]).filter(
        (key) => saved[key] !== form[key],
      ),
    [saved, form],
  );

  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!draft) {
      setError("Ada isian yang belum berupa angka.");
      return;
    }
    setBusy(true);
    setError(null);
    setIssues([]);
    setNotice(null);
    try {
      const result = await adminApi.saveEconomy(draft);
      const changed = Object.keys(result.changed).length;
      setNotice(
        changed === 0
          ? "Tidak ada yang berubah."
          : `${changed} nilai disimpan. Berlaku untuk balapan berikutnya.`,
      );
      onSaved();
    } catch (cause) {
      if (cause instanceof AdminRequestError) {
        setError(cause.message);
        setIssues(cause.issues);
      } else {
        setError("Config gagal disimpan.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {projection && (
        <section
          className="wallet-hero"
          aria-label="Dampak config ini kalau disimpan"
        >
          <div className="admin-figures">
            {projection.rows.map((row, index) => (
              <div
                className="admin-figure"
                key={row.label}
                data-tone={
                  index === 1 && row.idrPerMonthIdle > 5_000_000
                    ? "danger"
                    : "accent"
                }
              >
                <span className="eyebrow">
                  {index === 0 ? "Level 1" : "Upgrade maks"}
                </span>
                <strong>{rupiah(row.idrPerHour)}</strong>
                <span>
                  per jam aktif · {rupiah(row.idrPerMonthIdle)}/bulan idle
                </span>
              </div>
            ))}
            <div className="admin-figure">
              <span className="eyebrow">Akun baru</span>
              <strong>{rupiah(projection.freshAccountIdr)}</strong>
              <span>sebelum main</span>
            </div>
            <div className="admin-figure">
              <span className="eyebrow">Max-out</span>
              <strong>{decimal(projection.maxOutCost)}</strong>
              <span>
                koin · ≈{decimal(projection.maxOutHoursAtBase, 0)} jam idle
              </span>
            </div>
          </div>
          <div className="wallet-hero-side">
            <span className="wallet-pending">
              {dirtyKeys.length > 0
                ? `${dirtyKeys.length} nilai belum disimpan`
                : "Tersimpan"}
            </span>
            <InfoHint title="Angka ini dari mana">
              Dihitung dari isian di bawah dengan rumus yang dipakai server,
              sebelum disimpan. Proyeksi idle mengasumsikan pemain membuka app
              tiap jendela offline penuh.
            </InfoHint>
          </div>
        </section>
      )}

      <form className="panel wallet-form-panel" onSubmit={submit}>
        <SectionCardHeading
          icon={SlidersHorizontal}
          title="Config ekonomi"
          aside={
            <>
              <Badge variant={snapshot.usingDefaults ? "outline" : "secondary"}>
                {snapshot.usingDefaults ? "Bawaan" : "Tersimpan"}
              </Badge>
              <InfoHint title="Tentang config ini">
                {snapshot.usingDefaults
                  ? "Belum pernah disimpan, jadi yang berlaku adalah nilai bawaan di kode."
                  : `Terakhir disimpan ${snapshot.updatedAt ? timestamp(snapshot.updatedAt) : "—"}${snapshot.updatedBy ? ` oleh ${snapshot.updatedBy}` : ""}.`}{" "}
                Perubahan berlaku dalam 30 detik tanpa deploy.
              </InfoHint>
            </>
          }
        />

        <div className="admin-form">
          {/*
            Dilipat, bukan satu kolom panjang: 31 field berurutan membuat
            halaman ini ~11.000px di HP, dan menyetel satu angka berarti
            menggulir melewati semuanya. Grup pertama terbuka supaya panel
            tidak terlihat kosong.
          */}
          {GROUPS.map((group, index) => (
            <details
              className="admin-group"
              key={group.legend}
              open={index === 0}
            >
              <summary>
                <span>{group.legend}</span>
                <small>{group.fields.length}</small>
              </summary>
              {group.fields.map((field) => (
                <div
                  className="admin-field"
                  key={field.key}
                  data-dirty={saved[field.key] !== form[field.key]}
                >
                  <label htmlFor={`eco-${field.key}`}>
                    {field.label}
                    {field.hint && <span>{field.hint}</span>}
                  </label>
                  <input
                    id={`eco-${field.key}`}
                    className="wallet-input"
                    type="number"
                    inputMode="decimal"
                    step={field.step ?? "any"}
                    value={form[field.key]}
                    onChange={(event) => set(field.key, event.target.value)}
                  />
                </div>
              ))}
            </details>
          ))}

          <details className="admin-group">
            <summary>
              <span>Check-in harian</span>
              <small>1</small>
            </summary>
            <div
              className="admin-field"
              data-dirty={saved.dailyRewards !== form.dailyRewards}
            >
              <label htmlFor="eco-dailyRewards">
                Hadiah per hari streak
                <span>koin, dipisah koma</span>
              </label>
              <input
                id="eco-dailyRewards"
                className="wallet-input"
                inputMode="numeric"
                value={form.dailyRewards}
                onChange={(event) => set("dailyRewards", event.target.value)}
              />
            </div>
          </details>

          {error && (
            <div className="admin-notice" data-tone="error" role="alert">
              <p>{error}</p>
              {issues.length > 0 && (
                <ul>
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {notice && (
            <p className="admin-notice" data-tone="ok">
              {notice}
            </p>
          )}

          <div className="admin-actions">
            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              disabled={busy || dirtyKeys.length === 0}
            >
              {busy ? "Menyimpan…" : "Simpan config"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || dirtyKeys.length === 0}
              onClick={() => setForm(saved)}
            >
              Batalkan perubahan
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setForm(toForm(DEFAULT_ECONOMY))}
            >
              Isi ulang dengan bawaan
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
