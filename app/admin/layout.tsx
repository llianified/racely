import type { Metadata } from "next";
import "./admin.css";

/**
 * Panel operasional, bukan halaman publik: `robots` menahannya keluar dari
 * indeks. Isinya tetap dijaga sesi di `/api/admin/*` -- meta ini kenyamanan,
 * bukan keamanan.
 *
 * Lebarnya sama dengan app pemain (`--app-width`) karena dipakai dari HP juga.
 */
export const metadata: Metadata = {
  title: "Racely — Panel Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin-shell">{children}</div>;
}
