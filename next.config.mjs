/**
 * Content-Security-Policy dibangun di sini, bukan ditulis sebagai satu string
 * panjang, supaya tiap direktif punya alasan yang bisa dibaca.
 *
 * `script-src` masih memakai 'unsafe-inline': Next menyuntikkan script inline
 * untuk hydration tanpa nonce di konfigurasi ini, jadi melarangnya akan
 * mematikan app — bukan mengeraskannya. Yang tetap didapat: default-src yang
 * mengunci asal, object-src 'none', base-uri terkunci, dan daftar host yang
 * eksplisit untuk skrip Telegram serta foto profil pemain.
 *
 * 'unsafe-eval' hanya di luar produksi karena React Fast Refresh membutuhkannya;
 * build produksi tidak, jadi produksi tidak perlu menanggungnya.
 */
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Rewarded interstitial Monetag dimuat dari loader yang diberikan publisher.
 * Kreatif dan frame iklan datang dari host HTTPS yang dapat berubah, sedangkan
 * loader dan telemetri SDK tetap dibatasi ke host yang diketahui.
 */
const monetagSdkHost = 'https://libtl.com'
const monetagTelemetryHost = 'https://mc.yandex.ru'

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://telegram.org ${monetagSdkHost} ${monetagTelemetryHost}`,
  "style-src 'self' 'unsafe-inline'",
  /**
   * Foto profil pemain TIDAK lagi disebut di sini. `photo_url` di initData
   * menunjuk ke t.me, t.me membalas 302 ke CDN-nya, dan CSP memeriksa ulang
   * host target redirect itu -- host yang tidak pernah diumumkan Telegram dan
   * sudah sekali berubah di bawah kaki kami. Menambahkan tebakan berikutnya ke
   * daftar ini hanya menunda matinya avatar sampai tebakan itu ikut basi.
   *
   * Sekarang `/api/game/avatar` yang mengikuti redirect itu di server, lalu
   * mengalirkan byte-nya dari origin ini. 'self' menutupi seluruhnya. Lihat
   * `lib/telegram-avatar.ts`. blob: dipakai canvas WebGL.
   */
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "frame-src 'self' https:",
  "font-src 'self' data:",
  /**
   * Loader Monetag memanggil endpoint iklan yang host-nya dinamis. Membatasi
   * daftar ini ke libtl.com membuat loader berhasil tetapi XHR kreatif gagal
   * dengan Network error. Hanya koneksi pemain yang dibuka ke HTTPS; script-src
   * tetap memakai allowlist eksplisit di atas.
   */
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/**
 * Racely dibuka di dalam iframe Telegram, jadi app pemain TIDAK boleh memasang
 * frame-ancestors — itu akan memutus Telegram Web. Panel admin justru sebaliknya:
 * ia tidak pernah di-iframe siapa pun, tidak memakai Monetag, dan tidak perlu
 * akses jaringan pihak ketiga. Policy admin sengaja dibangun terpisah agar
 * kelonggaran connect-src/frame-src milik pemain tidak ikut terbawa.
 *
 * Direktifnya DIGABUNG ke dalam satu header, bukan dikirim sebagai header CSP
 * kedua. Next menerapkan header custom dengan `resHeaders[key] = value` — kunci
 * yang sama DITIMPA, bukan ditumpuk (lihat
 * `next/dist/server/lib/router-utils/resolve-routes.js`). Header kedua yang
 * hanya berisi frame-ancestors karena itu membuang seluruh sisa policy di
 * /admin: default-src, object-src, base-uri, form-action, semuanya hilang —
 * persis di satu-satunya halaman yang menyetujui pembayaran rupiah.
 */
const adminContentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://telegram.org`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "frame-src 'none'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      { source: '/(.*)', headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ] },
      { source: '/admin/:path*', headers: [
        { key: 'Content-Security-Policy', value: adminContentSecurityPolicy },
      ] },
      { source: '/admin', headers: [
        { key: 'Content-Security-Policy', value: adminContentSecurityPolicy },
      ] },
    ]
  },
  images: {
    unoptimized: true,
    // Tidak ada remotePatterns: satu-satunya gambar jarak jauh di app ini
    // adalah avatar Telegram, dan ia sekarang datang lewat /api/game/avatar
    // di origin sendiri.
  },
}

export default nextConfig
