"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      duration={1800}
      visibleToasts={1}
      offset="var(--space-md)"
      mobileOffset="var(--space-md)"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-(--icon-base)" />
        ),
        info: (
          <InfoIcon className="size-(--icon-base)" />
        ),
        warning: (
          <TriangleAlertIcon className="size-(--icon-base)" />
        ),
        error: (
          <OctagonXIcon className="size-(--icon-base)" />
        ),
        loading: (
          <Loader2Icon className="size-(--icon-base) animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
