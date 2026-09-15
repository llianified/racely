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
 * Adsgram: SDK-nya dimuat dari sad.adsgram.ai, permintaan banner ke
 * api.adsgram.ai, dan kreatifnya (gambar/video) datang dari CDN pengiklan yang
 * berganti-ganti -- host yang tidak pernah diumumkan Adsgram. Karena itu img-src
 * dan media-src dibuka ke https: (bukan ke daftar tebakan yang akan basi), sementara
 * script/connect/frame tetap dikunci ke host Adsgram yang eksplisit.
 */
const adsgramHosts = 'https://*.adsgram.ai'

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://telegram.org https://sad.adsgram.ai`,
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
  `frame-src 'self' ${adsgramHosts}`,
  "font-src 'self' data:",
  `connect-src 'self' https://telegram.org ${adsgramHosts}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/**
 * Racely dibuka di dalam iframe Telegram, jadi app pemain TIDAK boleh memasang
 * frame-ancestors — itu akan memutus Telegram Web. Panel admin justru sebaliknya:
 * ia tidak pernah di-iframe siapa pun, jadi ia menolak dijadikan frame.
 *
 * Direktifnya DIGABUNG ke dalam satu header, bukan dikirim sebagai header CSP
 * kedua. Next menerapkan header custom dengan `resHeaders[key] = value` — kunci
 * yang sama DITIMPA, bukan ditumpuk (lihat
 * `next/dist/server/lib/router-utils/resolve-routes.js`). Header kedua yang
 * hanya berisi frame-ancestors karena itu membuang seluruh sisa policy di
 * /admin: default-src, object-src, base-uri, form-action, semuanya hilang —
 * persis di satu-satunya halaman yang menyetujui pembayaran rupiah.
 */
const adminContentSecurityPolicy = `${contentSecurityPolicy}; frame-ancestors 'none'`

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
