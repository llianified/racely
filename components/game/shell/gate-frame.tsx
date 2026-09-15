import Image from "next/image";
import { Flag, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function GateBrand() {
  return (
    <header className="gate-brand">
      <div className="gate-wordmark">
        <Image
          src="/racely-logo.png"
          alt=""
          width={372}
          height={248}
          sizes="48px"
          preload
          className="gate-logo"
        />
        <span>RACELY<span className="gate-brand-dot" aria-hidden="true">.</span></span>
      </div>
      <span className="gate-platform">MINI APP<br />TELEGRAM</span>
    </header>
  );
}

export function GateFooter() {
  return (
    <footer className="gate-footer">
      <Flag aria-hidden="true" />
      <p>Bangun garasi. Kuasai lintasan.</p>
    </footer>
  );
}

export function GateFrame({
  titleId,
  label,
  status,
  icon: Icon,
  title,
  description,
  children,
  actions,
  note,
}: {
  titleId: string;
  label: string;
  status: string;
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  note: ReactNode;
}) {
  return (
    <main className="game-gate font-sans">
      <div className="gate-layout">
        <GateBrand />
        <section className="panel gate-panel" aria-labelledby={titleId}>
          <div className="gate-ticket-header">
            <p><Icon aria-hidden="true" />{label}</p>
            <Badge variant="exclusive">{status}</Badge>
          </div>
          <div className="gate-body">
            <div className="gate-copy">
              <h1 id={titleId} className="gate-title">{title}</h1>
              <p className="gate-description">{description}</p>
            </div>
            {children}
          </div>
          <div className="gate-ticket-stub">
            <div className="gate-actions">{actions}</div>
            <p className="gate-note" role="status" aria-live="polite" aria-atomic="true">{note}</p>
          </div>
        </section>
        <GateFooter />
      </div>
    </main>
  );
}
