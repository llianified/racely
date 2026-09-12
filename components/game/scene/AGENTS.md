# `scene/` — lapisan react-three-fiber

Semua kode WebGL Racely ada di direktori ini dan **tidak ada yang lain**.
Itu bukan kebetulan: `eslint.config.mjs` mematikan `react-hooks/immutability`
tepat untuk `components/game/scene/**`.

## Kenapa aturan itu dimatikan

react-three-fiber menggerakkan scene graph dengan **memutasi objek Three.js**
di dalam `useFrame` / `useLayoutEffect` — kamera, material, tekstur. Itu model
pemrogramannya, bukan bug. `react-hooks/immutability` ditulis untuk state React
biasa dan akan menandai setiap penulisan itu sebagai error.

Konsekuensinya bagi kamu:

- **Komponen r3f baru wajib dibuat di sini.** Ditaruh di direktori lain, lint
  akan merah dengan error yang penyebabnya tidak jelas.
- **Jangan menaruh komponen React biasa di sini.** Aturan itu mati untuk
  seluruh direktori, jadi komponen non-3D akan kehilangan penjagaannya.

## Isi

- `mini-car.tsx` dan `car-lighting.tsx` dipakai bersama oleh `race-scene.tsx`
  **dan** `car-preview-scene.tsx`. Mengubahnya berdampak ke arena balap dan
  preview garasi sekaligus — periksa keduanya.
- Kedua scene dimuat pemanggilnya lewat `dynamic(() => import(...), { ssr: false })`.
  Pertahankan pola itu: scene tidak boleh ikut render di server.

## Menambah mobil

Geometri mobil ada di `mini-car.tsx`, tapi menambah mobil juga menyentuh
`lib/car-catalog.ts` dan sebuah migrasi SQL. Lihat `AGENTS.md` di root.
