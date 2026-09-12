import "server-only";

import { NextResponse } from "next/server";
import {
  hasSameOrigin,
  isAdminConfigured,
  isAuthenticatedAdmin,
} from "@/lib/admin-auth";

/**
 * Penjaga bersama untuk seluruh route di bawah `/api/admin`. Dipisah supaya
 * tidak ada satu pun endpoint yang lupa salah satu dari ketiga pemeriksaan:
 * panel dikonfigurasi, sesi sah, dan -- untuk yang mengubah -- asalnya sama.
 */
export const ADMIN_ACTOR = "admin";

const noStore = { "Cache-Control": "no-store" } as const;

export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

/**
 * Mengembalikan respons penolakan, atau null kalau permintaan boleh lanjut.
 * `mutating` menambahkan pemeriksaan Origin -- lapis kedua di atas cookie
 * SameSite=Lax.
 */
export function guardAdmin(
  request: Request,
  options: { mutating?: boolean } = {},
) {
  if (!isAdminConfigured()) {
    return adminJson(
      {
        error:
          "Panel admin belum dikonfigurasi. Set RACELY_ADMIN_PASSWORD (minimal 16 karakter).",
      },
      503,
    );
  }
  if (options.mutating && !hasSameOrigin(request)) {
    return adminJson({ error: "Asal permintaan tidak sah." }, 403);
  }
  if (!isAuthenticatedAdmin(request)) {
    return adminJson({ error: "Sesi admin tidak sah atau sudah berakhir." }, 401);
  }
  return null;
}
