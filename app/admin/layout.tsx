import type { Metadata } from "next";
import "./admin.css";

/**
 * Panel operasional, bukan halaman publik: `robots` menahannya keluar dari
 * indeks mesin pencari. Isinya sendiri tetap dijaga sesi di `/api/admin/*` --
 * meta ini kenyamanan, bukan keamanan.
 */
export const metadata: Metadata = {
  title: "Racely — Panel Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <main className="adm-shell">{children}</main>;
}
