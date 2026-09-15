"use client";

/**
 * Pembungkus tipis rewarded interstitial Monetag. SDK dimuat saat pemain
 * pertama kali menekan tombol iklan agar startup game tidak bergantung pada
 * jaringan pihak ketiga.
 *
 * Promise SDK hanya resolve setelah iklan selesai. Kredit koin tetap diputuskan
 * server lewat aksi `watch-ad`, termasuk plafon harian dan idempotensinya.
 */

export type MonetagRewardResult = {
  reward_event_type?: "valued" | "non_valued";
  estimated_price?: number;
  zone_id?: number;
};

type MonetagShow = (options?: {
  type?: "end" | "start" | "preload" | "pop" | "inApp";
  requestVar?: string;
  catchIfNoFeed?: boolean;
}) => Promise<MonetagRewardResult>;

declare global {
  interface Window {
    show_11811175?: MonetagShow;
  }
}

const SDK_URL = "https://libtl.com/sdk.js";
const SDK_FUNCTION_NAME = "show_11811175";

export const MONETAG_ZONE_ID = "11811175";
export type RewardedAdResult = "rewarded" | "ineligible" | "error" | "unavailable";

export function isMonetagRewardEligible(
  result: MonetagRewardResult | undefined,
  pageWasInterrupted: boolean,
): boolean {
  return !pageWasInterrupted && result?.reward_event_type === "valued";
}

let sdkLoading: Promise<MonetagShow | null> | null = null;

function loadSdk(): Promise<MonetagShow | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.show_11811175) return Promise.resolve(window.show_11811175);
  if (sdkLoading) return sdkLoading;

  sdkLoading = new Promise((resolve) => {
    const staleScript = document.querySelector<HTMLScriptElement>(
      `script[data-sdk="${SDK_FUNCTION_NAME}"]`,
    );
    staleScript?.remove();

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.dataset.zone = MONETAG_ZONE_ID;
    script.dataset.sdk = SDK_FUNCTION_NAME;
    script.onload = () => {
      const show = window.show_11811175 ?? null;
      if (!show) {
        sdkLoading = null;
        script.remove();
      }
      resolve(show);
    };
    script.onerror = () => {
      sdkLoading = null;
      script.remove();
      resolve(null);
    };
    document.head.append(script);
  });

  return sdkLoading;
}

export async function showRewardedAd(): Promise<RewardedAdResult> {
  const show = await loadSdk();
  if (!show) return "unavailable";

  let pageWasInterrupted = document.visibilityState !== "visible";
  const trackVisibility = () => {
    if (document.visibilityState !== "visible") pageWasInterrupted = true;
  };
  const trackPageHide = () => {
    pageWasInterrupted = true;
  };

  document.addEventListener("visibilitychange", trackVisibility);
  window.addEventListener("pagehide", trackPageHide);

  try {
    const result = await show({
      type: "end",
      requestVar: "racely_reward",
      catchIfNoFeed: true,
    });
    return isMonetagRewardEligible(result, pageWasInterrupted) ? "rewarded" : "ineligible";
  } catch {
    return "error";
  } finally {
    document.removeEventListener("visibilitychange", trackVisibility);
    window.removeEventListener("pagehide", trackPageHide);
  }
}
