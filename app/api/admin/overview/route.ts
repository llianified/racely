import { adminJson, guardAdmin } from "@/lib/admin-api";
import { AdminOpsError, readAuditTrail, readLiability } from "@/lib/admin-ops";
import { readEconomyConfig } from "@/lib/economy-store";
import { readEmissionSummary } from "@/lib/emission-store";
import { projectEconomy } from "@/lib/economy-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  try {
    const economy = await readEconomyConfig();
    const [liability, audit, emission] = await Promise.all([
      readLiability(),
      readAuditTrail(20),
      readEmissionSummary(),
    ]);
    return adminJson({
      economy,
      liability,
      audit,
      emission,
      projection: projectEconomy(economy),
    });
  } catch (error) {
    if (error instanceof AdminOpsError) {
      return adminJson({ error: error.message }, error.status);
    }
    return adminJson({ error: "Ringkasan belum bisa dibaca." }, 500);
  }
}
