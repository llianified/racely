import Image from "next/image";

export function BootScreen() {
  return (
    <main className="boot-screen">
      <Image
        src="/racely-logo.png"
        alt=""
        width={112}
        height={112}
        priority
        className="boot-logo"
      />
      <h1 className="boot-word">RACELY</h1>
      <div
        className="boot-bar"
        role="progressbar"
        aria-label="Memuat Racely"
        aria-busy="true"
      >
        <span />
      </div>
    </main>
  );
}
