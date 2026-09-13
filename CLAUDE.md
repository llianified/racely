@AGENTS.md

# Aturan histori Git

Bagian ini mengunci preferensi pemilik repository untuk commit dan pekerjaan
rewrite histori. Berlaku bersama `AGENTS.md`; bila pekerjaan tidak menyentuh
histori Git, jangan melakukan rewrite hanya untuk merapikan commit lama.

## Bentuk histori

- Histori `main` harus linear dan rapi: **satu commit untuk satu PR**, bukan satu
  commit untuk seluruh repository dan bukan mempertahankan seluruh commit kerja
  di dalam PR.
- Jangan membuat merge commit di `main`. Saat merapikan histori lama, squash
  setiap PR menjadi satu commit dan pertahankan commit langsung yang memang
  bukan berasal dari PR sebagai commit tersendiri.
- Jangan mengubah tree akhir repository saat pekerjaan hanya merapikan histori,
  judul, author, atau body commit. Verifikasi tree/diff sebelum push.
- Jika pemilik secara eksplisit meminta seluruh histori dijadikan satu commit,
  gunakan judul `Racely initial release`; aturan ini tidak menggantikan default
  squash per PR di atas.

## Identitas commit

- Semua commit hasil rewrite harus memakai author **dan committer** milik
  pemilik repository: `llian <llianified@gmail.com>`.
- Hapus trailer atribusi agent seperti `Co-authored-by` dari histori yang sedang
  dirapikan. Jangan mengganti identitas pemilik dengan Claude, v0, Ubuntu, atau
  identitas mesin.
- Pertahankan tanggal author dan committer asli sejauh rewrite memungkinkan.

## Judul dan body commit

- Judul wajib memakai Conventional Commits berbahasa Inggris, ringkas, spesifik,
  dan sesuai perubahan nyata, misalnya `feat:`, `fix:`, `refactor:`, `perf:`,
  `docs:`, atau `chore:`.
- Judul commit hasil PR wajib diakhiri ` (#<nomor>)` agar GitHub menampilkannya
  sebagai tautan ke PR, misalnya `perf: reduce race scene rendering (#76)`.
  Commit langsung non-PR tidak memakai suffix ini.
- Judul PR harus tetap bersih tanpa menambahkan nomor PR miliknya sendiri;
  suffix `(#<nomor>)` hanya berlaku pada judul commit hasil squash.
- Body wajib berbahasa Inggris dan terdiri dari 1–2 kalimat ringkas yang
  menjelaskan perubahan serta tujuannya tanpa sekadar mengulang judul.
- Pisahkan judul dan body dengan satu baris kosong. Jangan isi body dengan
  template generik, daftar file mentah, secret, atau detail yang tidak dapat
  dibuktikan dari diff.
- Untuk commit yang berasal dari PR, tambahkan trailer setelah satu baris kosong:
  `Original-PR: #<nomor>`. Commit langsung non-PR tidak memakai trailer palsu.
- Saat hanya diminta merapikan body, jangan mengubah judul, urutan commit, tree,
  author, committer, atau pemetaan PR yang sudah disetujui.

## Prosedur rewrite yang aman

1. Pastikan worktree bersih, ambil SHA `main` lokal dan remote, lalu pastikan
   keduanya sama sebelum rewrite.
2. Sebelum mengubah histori, push backup branch bernama deskriptif seperti
   `backup/main-before-<operasi>-<tanggal>-<sha-pendek>` yang menunjuk ke SHA
   lama.
3. Bangun histori baru secara deterministik berdasarkan urutan first-parent dan
   pemetaan PR yang sudah diverifikasi. Jangan menebak nomor PR dari judul saja
   jika metadata GitHub masih dapat diperiksa.
4. Sebelum push, verifikasi jumlah commit yang diharapkan, nol merge commit,
   seluruh author/committer benar, format body dan `Original-PR` valid, serta
   diff tree lama terhadap tree baru kosong.
5. Rewrite `main` hanya setelah pemilik memberi persetujuan eksplisit. Push
   dengan `--force-with-lease` yang mengunci SHA lama; jangan memakai
   `--force` tanpa lease.
6. Setelah push, cocokkan SHA `main` remote dengan hasil lokal dan pastikan
   backup remote tersedia. Laporkan SHA/branch backup kepada pemilik.
