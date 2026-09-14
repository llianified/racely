import Image from "next/image";

/**
 * `overlay` menahan layar boot DI ATAS layar lain yang sedang dirender diam-diam
 * di belakangnya (onboarding menunggu panggung 3D-nya siap), jadi elemennya
 * bukan <main>: halaman di belakangnya sudah punya satu.
 */
export function BootScreen({ overlay = false }: { overlay?: boolean } = {}) {
  const Root = overlay ? "div" : "main";
  return (
    <Root className={overlay ? "boot-screen boot-overlay font-sans" : "boot-screen font-sans"}>
      <p className="boot-eyebrow">YOUR NEXT LAP STARTS HERE</p>

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
          <p className="boot-status" id="boot-status" role="status">
            Menyiapkan Racely<span aria-hidden="true">...</span>
          </p>
        </div>
      </div>

      <p className="boot-footer">
        <span>GARASI</span><span aria-hidden="true">/</span>
        <span>UPGRADE</span><span aria-hidden="true">/</span>
        <span>BALAPAN</span>
      </p>
    </Root>
  );
}
