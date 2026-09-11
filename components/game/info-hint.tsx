"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function InfoHint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" />} aria-label={`Info: ${title}`}>
        <Info aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
