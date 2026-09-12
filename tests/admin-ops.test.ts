import { describe, expect, it } from "vitest";
import {
  WITHDRAWAL_STATUSES,
  transitionAllowed,
} from "../lib/admin-ops";
import { WITHDRAW_STATUS_LABEL, type WithdrawStatus } from "../lib/game";

/**
 * Tabel perpindahan status penarikan. Ini satu-satunya tempat uang bisa
 * dinyatakan sudah keluar, jadi yang dijaga di sini bukan cuma jalur yang
 * boleh -- tapi terutama jalur yang TIDAK boleh ada.
 */
describe("Perpindahan status penarikan", () => {
  it("mencakup seluruh status yang dikenal UI", () => {
    expect([...WITHDRAWAL_STATUSES]).toEqual(
      Object.keys(WITHDRAW_STATUS_LABEL),
    );
  });

  it("mengizinkan alur operator yang wajar", () => {
    expect(transitionAllowed("pending", "processing")).toBe(true);
    expect(transitionAllowed("pending", "paid")).toBe(true);
    expect(transitionAllowed("pending", "rejected")).toBe(true);
    expect(transitionAllowed("processing", "paid")).toBe(true);
    expect(transitionAllowed("processing", "rejected")).toBe(true);
  });

  /**
   * Migrasi 0008 menuliskannya: 'rejected' mengembalikan koin ke saldo pemain.
   * Memakainya untuk membereskan penarikan yang sudah dibayar akan memulangkan
   * koin yang uangnya sudah keluar dari rekening -- pemain dibayar dua kali.
   */
  it("tidak pernah membiarkan penarikan yang sudah dibayar bergerak", () => {
    for (const status of WITHDRAWAL_STATUSES) {
      expect(transitionAllowed("paid", status)).toBe(false);
    }
  });

  /**
   * 'rejected' juga akhir: koinnya sudah dipulangkan, jadi menghidupkannya
   * kembali berarti membayar koin yang tidak lagi dipotong dari saldo.
   */
  it("tidak pernah menghidupkan kembali penarikan yang ditolak", () => {
    for (const status of WITHDRAWAL_STATUSES) {
      expect(transitionAllowed("rejected", status)).toBe(false);
    }
  });

  it("tidak mengizinkan perpindahan ke dirinya sendiri atau mundur", () => {
    for (const status of WITHDRAWAL_STATUSES) {
      expect(transitionAllowed(status, status)).toBe(false);
    }
    expect(transitionAllowed("processing", "pending")).toBe(false);
  });

  it("tidak punya satu pun jalur keluar dari status akhir", () => {
    const terminal: WithdrawStatus[] = ["paid", "rejected"];
    const reachable = WITHDRAWAL_STATUSES.flatMap((from) =>
      WITHDRAWAL_STATUSES.filter((to) => transitionAllowed(from, to)).map(
        (to) => `${from}->${to}`,
      ),
    );
    for (const from of terminal) {
      expect(reachable.some((edge) => edge.startsWith(`${from}->`))).toBe(false);
    }
    // Dan tidak ada jalur yang memindahkan penarikan tanpa operator: seluruh
    // tepi di atas hanya bisa dipicu POST /api/admin/withdrawals.
    expect(reachable).toEqual([
      "pending->processing",
      "pending->paid",
      "pending->rejected",
      "processing->paid",
      "processing->rejected",
    ]);
  });
});
