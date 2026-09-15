import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * `overlay` menahan layar boot DI ATAS layar lain yang sedang dirender diam-diam
 * di belakangnya (onboarding menunggu panggung 3D-nya siap), jadi elemennya
 * bukan <main>: halaman di belakangnya sudah punya satu.
 */
export function BootScreen({ overlay = false }: { overlay?: boolean } = {}) {
  const Root = overlay ? "div" : "main";
  return (
    <Root className={cn("boot-screen font-sans", overlay && "boot-overlay")}>
      <p className="boot-eyebrow">LINTASAN BERIKUTNYA MENUNGGUMU</p>

      <div className="boot-content">
        <div className="boot-brand">
          <Image
            src="/racely-logo.png"
            alt=""
            width={372}
            height={248}
            sizes="156px"
            preload
            className="boot-logo"
          />
          <h1 className="boot-word">RACELY<span aria-hidden="true">.</span></h1>
          <p className="boot-tagline">Bangun garasi. Kuasai lintasan.</p>
        </div>

        <div className="boot-loader">
          <div className="boot-loader-heading">
            <span>Persiapan balapan</span>
            <Badge variant="exclusive">Memuat</Badge>
          </div>
          <div
            className="boot-start-lights"
            role="progressbar"
            aria-label="Memuat Racely"
            aria-describedby="boot-status"
            aria-busy="true"
          >
            {[0, 1, 2, 3, 4].map((light) => (
              <span className="boot-light-housing" key={light} aria-hidden="true">
                <span className="boot-light" />
                <span className="boot-light" />
              </span>
            ))}
          </div>
          <div className="boot-loader-copy">
            <p className="boot-status" id="boot-status" role="status">
              {overlay ? "Menyiapkan mobil pertamamu…" : "Menyiapkan Racely…"}
            </p>
            <p className="boot-loader-note">Sebentar lagi, giliranmu di lintasan.</p>
          </div>
        </div>
      </div>

      <p className="boot-footer">
        <span>GARASI</span><span aria-hidden="true">/</span>
        <span>MODIFIKASI</span><span aria-hidden="true">/</span>
        <span>BALAPAN</span>
      </p>
    </Root>
  );
}
