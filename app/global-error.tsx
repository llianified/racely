'use client'

/**
 * Jaring terakhir: `app/error.tsx` hanya menangkap lemparan DI DALAM layout
 * root. Kalau layout-nya sendiri yang gagal, hanya berkas ini yang tersisa --
 * dan ia mengganti seluruh dokumen, jadi ia harus membawa <html> dan <body>
 * sendiri.
 *
 * Gayanya ditulis inline, bukan lewat globals.css: kalau yang gagal justru
 * pemuatan layout, tidak ada jaminan lembar gaya itu ikut terpasang, dan
 * halaman darurat yang tampil sebagai teks hitam di atas hitam sama tidak
 * berartinya dengan halaman putih yang ia gantikan.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          background: '#090c1d',
          color: '#e9eef7',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24 }}>Racely gagal dimuat</h1>
        <p style={{ margin: 0, maxWidth: 360, lineHeight: 1.6, color: '#a3a8c3' }}>
          Progresmu tersimpan di server. Tutup Racely lalu buka lagi dari
          @RacelyBot, atau coba muat ulang.
        </p>
        {/* Alasan yang sama dengan app/error.tsx: di dalam WebView Telegram
            tidak ada console yang bisa dibuka pemain. */}
        <p style={{ margin: 0, maxWidth: 360, fontSize: 12, color: '#a3a8c3', wordBreak: 'break-word' }}>
          {error.name}: {error.message}
        </p>
        {error.digest && (
          <p style={{ margin: 0, fontSize: 12, color: '#a3a8c3' }}>Kode: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 44,
            padding: '0 20px',
            border: 0,
            borderRadius: 12,
            background: '#f5c518',
            color: '#090c1d',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          Muat ulang
        </button>
      </body>
    </html>
  )
}
