# Histori Git — bentuk, identitas, dan prosedur rewrite

Dokumen ini mengunci preferensi pemilik repository untuk pekerjaan **rewrite
histori**: rebase per PR, merapikan judul, body, atau author commit lama.
Aturan commit harian ada di `CLAUDE.md`; dokumen ini hanya perlu dibaca kalau
tugasnya memang menyentuh histori. Jangan melakukan rewrite hanya untuk
merapikan commit lama.

## Bentuk histori

- Histori `main` harus linear dan rapi: **commit individual setiap PR** melalui
  **Rebase and merge**, bukan satu squash commit untuk satu PR dan bukan merge
  commit.
- Jangan membuat merge commit di `main`. Saat merapikan histori lama, replay
  setiap commit non-merge dari PR secara berurutan, buang merge commit internal,
  dan pertahankan commit langsung yang memang bukan berasal dari PR sebagai
  commit tersendiri.
- Jangan mengubah tree akhir repository saat pekerjaan hanya merapikan histori,
  judul, author, atau body commit. Verifikasi tree pada setiap batas PR serta
  diff akhir sebelum push.
- Jika pemilik secara eksplisit meminta seluruh histori dijadikan satu commit,
  gunakan judul `Racely initial release`; aturan ini tidak menggantikan default
  Rebase and merge di atas.

## Identitas commit

- Semua commit hasil rewrite harus memakai author **dan committer** milik
  pemilik repository: `llian <llianified@gmail.com>`.
- Hapus trailer atribusi agent seperti `Co-authored-by` dari histori yang sedang
  dirapikan. Jangan mengganti identitas pemilik dengan Claude, v0, Ubuntu, atau
  identitas mesin.
- Pertahankan tanggal author dan committer asli sejauh rewrite memungkinkan.

## Judul dan body commit hasil rewrite

Format dasar judul dan body mengikuti `CLAUDE.md`. Tambahan khusus rewrite:

- Judul setiap commit hasil PR wajib diakhiri ` (#<nomor>)` agar GitHub
  menampilkannya sebagai tautan ke PR, misalnya
  `perf: reduce race scene rendering (#76)`. Commit langsung non-PR tidak
  memakai suffix ini.
- Judul PR harus tetap bersih tanpa menambahkan nomor PR miliknya sendiri;
  suffix `(#<nomor>)` hanya berlaku pada judul commit hasil replay.
- Untuk setiap commit yang berasal dari PR, tambahkan trailer setelah satu baris
  kosong: `Original-PR: #<nomor>`. Commit langsung non-PR tidak memakai trailer
  palsu.
- Saat hanya diminta merapikan body, jangan mengubah judul, urutan commit, tree,
  author, committer, atau pemetaan PR yang sudah disetujui.

## Prosedur rewrite yang aman

1. Pastikan worktree bersih, ambil SHA `main` lokal dan remote, lalu pastikan
   keduanya sama sebelum rewrite.
2. Sebelum mengubah histori remote, push backup branch bernama deskriptif seperti
   `backup/main-before-<operasi>-<tanggal>-<sha-pendek>` yang menunjuk ke SHA
   lama.
3. Bangun histori baru secara deterministik berdasarkan urutan first-parent dan
   manifest commit tiap PR yang sudah diverifikasi. Jangan menebak nomor PR dari
   judul jika metadata GitHub masih dapat diperiksa.
4. Replay commit non-merge dalam urutan manifest, buang merge commit internal,
   dan cocokkan tree hasil replay dengan tree commit lama pada setiap batas PR.
5. Sebelum push, verifikasi jumlah commit sama dengan jumlah commit PR non-merge
   dalam manifest ditambah commit langsung, nol merge commit, seluruh
   author/committer benar, format body dan `Original-PR` valid, serta diff tree
   lama terhadap tree baru hanya memuat perubahan kebijakan yang memang diminta.
6. Rewrite `main` hanya setelah pemilik memberi persetujuan eksplisit. Push
   dengan `--force-with-lease` yang mengunci SHA lama; jangan memakai `--force`
   tanpa lease.
7. Setelah push, cocokkan SHA `main` remote dengan hasil lokal dan pastikan
   backup remote tersedia. Laporkan SHA dan branch backup kepada pemilik.
