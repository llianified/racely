import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  clientAddress,
  createAdminSession,
  hasSameOrigin,
  isAdminConfigured,
  isAuthenticatedAdmin,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { ADMIN_ACTOR, adminJson } from "@/lib/admin-api";
import { recordAudit } from "@/lib/admin-ops";
import { ADMIN_LOGIN_RULE, consumeRateLimit } from "@/lib/rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/http-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
const loginSchema = z.object({ password: z.string().min(1).max(512) }).strict();

/** Dipakai halaman panel untuk memutuskan menampilkan form login atau isinya. */
export async function GET(request: Request) {
  return adminJson({
    configured: isAdminConfigured(),
    authenticated: isAdminConfigured() && isAuthenticatedAdmin(request),
  });
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return adminJson(
      {
        error:
          "Panel admin belum dikonfigurasi. Set RACELY_ADMIN_PASSWORD (minimal 16 karakter).",
      },
      503,
    );
  }
  if (!hasSameOrigin(request)) {
    return adminJson({ error: "Asal permintaan tidak sah." }, 403);
  }

  const limit = consumeRateLimit(
    `admin-login:${clientAddress(request)}`,
    ADMIN_LOGIN_RULE,
  );
  if (!limit.allowed) {
    return adminJson(
      { error: "Terlalu banyak percobaan masuk. Tunggu sebentar." },
      429,
    );
  }

  let payload: unknown;
  try {
    payload = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return adminJson({ error: "Permintaan terlalu besar." }, 413);
    }
    return adminJson({ error: "Isi permintaan tidak valid." }, 400);
  }

  const body = loginSchema.safeParse(payload);
  if (!body.success) {
    return adminJson({ error: "Isi permintaan tidak valid." }, 400);
  }

  if (!verifyAdminPassword(body.data.password)) {
    // Percobaan gagal ikut dicatat: itu satu-satunya tanda ada yang menebak.
    await recordAudit({
      actor: ADMIN_ACTOR,
      action: "session:denied",
      detail: { address: clientAddress(request) },
    });
    return adminJson({ error: "Password salah." }, 401);
  }

  const session = createAdminSession();
  const response = adminJson({ authenticated: true });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    session.value,
    adminCookieOptions(request, session.maxAge),
  );
  await recordAudit({
    actor: ADMIN_ACTOR,
    action: "session:granted",
    detail: { address: clientAddress(request) },
  });
  return response;
}

export async function DELETE(request: Request) {
  // Satu-satunya route /api/admin yang tidak lewat guardAdmin -- keluar tanpa
  // sesi memang tidak berbahaya. Tapi cek Origin tetap dipakai: tanpanya situs
  // lain bisa mengeluarkan operator dari panel di tengah memproses antrean.
  if (!hasSameOrigin(request)) {
    return adminJson({ error: "Asal permintaan tidak sah." }, 403);
  }

  const response = adminJson({ authenticated: false });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    "",
    adminCookieOptions(request, 0),
  );
  return response;
}
