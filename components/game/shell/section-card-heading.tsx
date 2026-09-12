import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionCardHeadingProps = {
  icon: LucideIcon;
  title: ReactNode;
  aside?: ReactNode;
  level?: 2 | 3;
  className?: string;
};

export function SectionCardHeading({
  icon: Icon,
  title,
  aside,
  level = 2,
  className,
}: SectionCardHeadingProps) {
  const Heading = level === 3 ? "h3" : "h2";

  return (
    <div className={cn("section-card-heading", className)}>
      <Heading>
        <Icon aria-hidden="true" />
        {title}
      </Heading>
      {aside !== undefined && <div className="heading-aside">{aside}</div>}
    </div>
  );
}
