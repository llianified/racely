"use client";

import type { CSSProperties } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check } from "lucide-react";
import { CAR_CATALOG, type CarColor, type CarModelId } from "@/lib/car-catalog";
import { cn } from "@/lib/utils";

export function CarColorPicker({ model, color, disabled = false, onChoose }: {
  model: CarModelId;
  color: string;
  disabled?: boolean;
  onChoose: (color: CarColor, name: string) => void;
}) {
  const choices = CAR_CATALOG[model].colors;
  return (
    <div className="garage-customize">
      <div className="garage-color-label">
        <span>Warna bodi</span>
        <strong>{choices.find((choice) => choice.color === color)?.name ?? "Warna pilihan"}</strong>
      </div>
      <ToggleGroup className="body-colors" aria-label={`Warna ${CAR_CATALOG[model].name}`} value={[color]} disabled={disabled} onValueChange={(values) => {
        const choice = choices.find((item) => item.color === values[0]);
        if (choice) onChoose(choice.color, choice.name);
      }}>
        {choices.map((choice) => (
          <Toggle key={choice.color} value={choice.color} aria-label={`Warna ${choice.name}`} className={cn("color-swatch", color === choice.color && "selected")} style={{ "--swatch": choice.color } as CSSProperties}>
            {color === choice.color && <Check aria-hidden="true" />}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
