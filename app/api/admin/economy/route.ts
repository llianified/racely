import { ADMIN_ACTOR, adminJson, guardAdmin } from "@/lib/admin-api";
import { recordAudit } from "@/lib/admin-ops";
import {
  DEFAULT_ECONOMY,
  economyFieldKeys,
  type EconomyConfig,
} from "@/lib/economy-config";
import {
  EconomyConfigError,
  readEconomyConfigSnapshot,
  writeEconomyConfig,
} from "@/lib/economy-store";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/http-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8192;

export async function GET(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;
  try {
    const snapshot = await readEconomyConfigSnapshot();
    return adminJson({ ...snapshot, defaults: DEFAULT_ECONOMY });
  } catch {
    return adminJson({ error: "Config ekonomi belum bisa dibaca." }, 500);
  }
}

/** Field yang benar-benar berubah, supaya jejak audit bisa dibaca manusia. */
function changedFields(before: EconomyConfig, after: EconomyConfig) {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of economyFieldKeys) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changed[key] = { from, to };
    }
  }
  return changed;
}

export async function PUT(request: Request) {
  const denied = guardAdmin(request, { mutating: true });
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return adminJson({ error: "Permintaan terlalu besar." }, 413);
    }
    return adminJson({ error: "Isi permintaan tidak valid." }, 400);
  }

  try {
    const before = (await readEconomyConfigSnapshot()).config;
    const saved = await writeEconomyConfig(payload, ADMIN_ACTOR);
    const changed = changedFields(before, saved);
    await recordAudit({
      actor: ADMIN_ACTOR,
      action: "economy:save",
      target: "default",
      detail: { changed, fields: Object.keys(changed).length },
    });
    return adminJson({ config: saved, changed });
  } catch (error) {
    if (error instanceof EconomyConfigError) {
      return adminJson({ error: error.message, issues: error.issues }, 422);
    }
    return adminJson({ error: "Config belum bisa disimpan." }, 500);
  }
}
