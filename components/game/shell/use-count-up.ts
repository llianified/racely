"use client";

import { useEffect, useRef, useState } from "react";
import { roundCoins } from "@/lib/game";

/** Cukup panjang untuk terbaca sebagai "naik", cukup pendek untuk tidak menahan aksi berikutnya. */
const DURATION_MS = 560;

/** Ease-out kubik: angka melesat di awal lalu mendarat pelan di nilai akhir. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Nilai yang tampil pada progres `t` (0..1). Dipisah dari hook-nya supaya rumus
 * ini bisa diuji tanpa DOM -- `tests/` berjalan di environment node.
 *
 * Presisinya mengikuti kedua ujung: saldo bulat digulirkan bulat-bulat. Kalau
 * tidak, animasi menyisipkan desimal ("28.271,33") yang tidak pernah muncul
 * saat angkanya diam -- lebarnya ikut goyang dan terbaca seperti salah hitung.
 */
export function countUpValue(from: number, to: number, t: number) {
  if (t >= 1) return to;
  const value = from + (to - from) * easeOut(Math.max(0, t));
  return Number.isInteger(from) && Number.isInteger(to)
    ? Math.round(value)
    : roundCoins(value);
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Menggulirkan angka dari nilai lama ke nilai baru.
 *
 * Saldo yang melompat begitu saja tidak terbaca sebagai "dapat koin", cuma
 * terbaca sebagai layar yang berubah. Yang bergulir naik terbaca sebagai hadiah
 * yang sedang masuk -- itu seluruh alasan hook ini ada.
 *
 * Nilai pertama tidak pernah dianimasikan: saldo yang memang sudah dimiliki
 * bukan hadiah baru, dan menghitungnya dari nol tiap kali tab dibuka justru
 * bohong.
 */
export function useCountUp(value: number) {
  const [displayed, setDisplayed] = useState(value);
  // Titik berangkat animasi berikutnya. Kalau saldo berubah lagi di tengah
  // animasi, yang baru menyambung dari angka yang sedang terlihat -- bukan
  // meloncat balik ke nilai lama lalu mengulang.
  const shown = useRef(value);

  useEffect(() => {
    const from = shown.current;
    if (from === value) return;

    const settle = () => {
      shown.current = value;
      setDisplayed(value);
    };
    if (prefersReducedMotion()) {
      settle();
      return;
    }

    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = (now - start) / DURATION_MS;
      const next = countUpValue(from, value, t);
      shown.current = next;
      setDisplayed(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return displayed;
}
