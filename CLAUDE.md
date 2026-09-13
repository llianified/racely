@AGENTS.md

# Commit

- Judul memakai Conventional Commits berbahasa Inggris — `feat:`, `fix:`,
  `refactor:`, `perf:`, `docs:`, `chore:` — ringkas, spesifik, dan sesuai
  perubahan nyata. Judul PR tidak memakai nomor PR-nya sendiri.
- Body berbahasa Inggris, 1–2 kalimat yang menjelaskan perubahan dan
  tujuannya, dipisahkan dari judul oleh satu baris kosong. Tanpa template
  generik, daftar file mentah, secret, atau klaim yang tidak terbukti dari
  diff.
- Jangan melakukan rewrite histori (squash, rebase, amend commit yang sudah
  di-push) hanya untuk merapikan commit lama. Bila pemilik memang memintanya,
  ikuti `docs/git-history.md`, dan jangan menyentuh `main` tanpa persetujuan
  eksplisit.
