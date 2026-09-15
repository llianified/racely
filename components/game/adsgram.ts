"use client";

/**
 * Pembungkus tipis SDK Adsgram (https://docs.adsgram.ai/publisher/api-reference).
 * SDK dimuat malas saat tombol iklan pertama ditekan, bukan di layout: pemain
 * yang tidak pernah menonton iklan tidak perlu mengunduh skrip pihak ketiga,
 * dan CSP di next.config.mjs sudah mengizinkan sad.adsgram.ai.
 *
 * Kredit koinnya TIDAK diputuskan di sini. Modul ini hanya melaporkan apakah
 * promise `show()` resolve; server yang menegakkan plafon harian (aksi
 * `watch-ad`).
 */

type ShowPromiseResult = {
  done: boolean;
  description: string;
  state: "load" | "render" | "playing" | "destroy";
  error: boolean;
};

type AdController = {
  show: () => Promise<ShowPromiseResult>;
  destroy: () => void;
};

type AdsgramSdk = {
  init: (options: { blockId: string; debug?: boolean; debugBannerType?: "FullscreenMedia" | "RewardedVideo" }) => AdController;
};

declare global {
  interface Window {
    Adsgram?: AdsgramSdk;
  }
}

const SDK_URL = "https://sad.adsgram.ai/js/sad.min.js";

export const ADSGRAM_BLOCK_ID = process.env.NEXT_PUBLIC_ADSGRAM_BLOCK_ID ?? "";

export type RewardedAdResult = "rewarded" | "skipped" | "error" | "unavailable";

let sdkLoading: Promise<AdsgramSdk | null> | null = null;

function loadSdk(): Promise<AdsgramSdk | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Adsgram) return Promise.resolve(window.Adsgram);
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Adsgram ?? null);
    script.onerror = () => {
      // Biarkan percobaan berikutnya memuat ulang; jaringan bisa pulih.
      sdkLoading = null;
      script.remove();
      resolve(null);
    };
    document.head.append(script);
  });
  return sdkLoading;
}

/**
 * `debug` menyalakan iklan tes dari server Adsgram. Dipakai di mode preview
 * (di luar Telegram, referrer bukan racely.fun) supaya alurnya bisa dicoba
 * saat `pnpm dev`; di produksi harus false, kalau tidak tayangan tidak
 * pernah masuk statistik.
 */
export async function showRewardedAd(options: { debug: boolean }): Promise<RewardedAdResult> {
  if (!ADSGRAM_BLOCK_ID) return "unavailable";
  const sdk = await loadSdk();
  if (!sdk) return "unavailable";
  try {
    const controller = sdk.init({
      blockId: ADSGRAM_BLOCK_ID,
      debug: options.debug,
      ...(options.debug ? { debugBannerType: "RewardedVideo" as const } : {}),
    });
    const result = await controller.show();
    return result.done ? "rewarded" : "skipped";
  } catch (cause) {
    const result = cause as Partial<ShowPromiseResult> | undefined;
    return result?.error ? "error" : "skipped";
  }
}
