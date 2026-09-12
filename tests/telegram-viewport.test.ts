import { describe, expect, it, vi } from "vitest";
import { connectTelegramViewport } from "../components/game/use-telegram-webapp";

function fixture(version = 8) {
  const properties = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      setProperty: (key: string, value: string) => properties.set(key, value),
      removeProperty: (key: string) => properties.delete(key),
    },
  };
  const app = {
    platform: "android", initData: "", ready: vi.fn(), expand: vi.fn(),
    setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(),
    isVersionAtLeast: (minimum: string) => version >= Number(minimum),
    requestFullscreen: vi.fn(), isFullscreen: false,
    safeAreaInset: { top: 32, bottom: 24, left: 0, right: 0 },
    contentSafeAreaInset: { top: 56, bottom: 0, left: 0, right: 0 },
    onEvent: (event: string, callback: () => void) => listeners.set(event, callback),
    offEvent: (event: string) => listeners.delete(event),
  };
  const connect = () => connectTelegramViewport(app, root as unknown as HTMLElement);
  return { app, root, properties, listeners, connect };
}

describe("Telegram fullscreen viewport", () => {
  it("requests fullscreen once, including a Strict Mode reconnect", () => {
    const { app, connect } = fixture();
    connect()();
    connect()();
    expect(app.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does not request fullscreen on older or already-fullscreen clients", () => {
    const older = fixture(7);
    older.connect()();
    expect(older.app.requestFullscreen).not.toHaveBeenCalled();
    const active = fixture();
    active.app.isFullscreen = true;
    active.connect()();
    expect(active.app.requestFullscreen).not.toHaveBeenCalled();
  });

  it("tracks native state and both inset layers independently", () => {
    const { app, root, properties, listeners, connect } = fixture();
    const disconnect = connect();
    expect(root.dataset.telegramFullscreen).toBe("false");
    app.isFullscreen = true;
    listeners.get("fullscreenChanged")?.();
    expect(root.dataset.telegramFullscreen).toBe("true");
    expect(properties.get("--racely-device-inset-top")).toBe("32px");
    expect(properties.get("--racely-content-inset-top")).toBe("56px");
    app.safeAreaInset = { top: 0, bottom: 0, left: 44, right: 0 };
    listeners.get("safeAreaChanged")?.();
    expect(properties.get("--racely-device-inset-left")).toBe("44px");
    app.contentSafeAreaInset.top = 48;
    listeners.get("contentSafeAreaChanged")?.();
    expect(properties.get("--racely-content-inset-top")).toBe("48px");
    app.isFullscreen = false;
    listeners.get("fullscreenChanged")?.();
    expect(root.dataset.telegramFullscreen).toBe("false");
    expect(app.requestFullscreen).toHaveBeenCalledTimes(1);
    disconnect();
    expect(listeners.size).toBe(0);
    expect(properties.size).toBe(0);
    expect(root.dataset.telegramFullscreen).toBeUndefined();
  });

  it("keeps the expanded layout if fullscreen throws or fails", () => {
    const { app, root, listeners, connect } = fixture();
    app.requestFullscreen.mockImplementation(() => { throw new Error("unsupported"); });
    expect(() => connect()).not.toThrow();
    listeners.get("fullscreenFailed")?.();
    expect(root.dataset.telegramFullscreen).toBe("false");
  });

  it("ignores invalid insets and clamps negative values", () => {
    const { app, properties, listeners, connect } = fixture();
    const disconnect = connect();
    app.safeAreaInset.top = Number.NaN;
    app.safeAreaInset.left = -10;
    listeners.get("safeAreaChanged")?.();
    expect(properties.has("--racely-device-inset-top")).toBe(false);
    expect(properties.get("--racely-device-inset-left")).toBe("0px");
    disconnect();
  });
});
