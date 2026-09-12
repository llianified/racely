import Image from "next/image";
import { Car } from "lucide-react";

export function BootScreen() {
  return (
    <main className="boot-screen">
      <Image
        src="/racely-logo.png"
        alt=""
        width={372}
        height={248}
        priority
        className="boot-logo"
      />
      <h1 className="boot-word">RACELY</h1>
      <div
        className="boot-loader"
        role="progressbar"
        aria-label="Memuat Racely"
        aria-busy="true"
      >
        <div className="boot-bar" aria-hidden="true">
          <span>
            <Car className="boot-car" aria-hidden="true" />
          </span>
        </div>
      </div>
    </main>
  );
}
