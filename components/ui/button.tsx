import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--radius) text-sm font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-(length:--stroke-3) focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:ring-(length:--stroke-3) aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-base)",
  {
    variants: {
      variant: {
        // Semua varian berisi (bukan ghost/link/menu) satu keluarga `press-button`:
        // kotak datar tanpa hairline/alas di luar, jadi tombol emas dan tombol
        // biasa selalu sama tinggi dan satu silhouette. Emas hanya menambah
        // warna dan efek inset lewat `gold-button`.
        default: 'press-button bg-primary text-primary-foreground hover:bg-primary/85',
        gold: 'press-button gold-button',
        // Pasangan tonal dari `gold`, untuk aksi per-baris: emas tetap
        // menandai aksi, tapi tanpa isian penuh yang membuat setiap baris
        // berebut jadi tombol utama layar.
        goldSoft:
          'press-button bg-accent/12 text-accent hover:bg-accent/22 focus-visible:ring-accent/25',
        outline:
          'press-button outline-button bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'press-button bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'press-button bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
        menu: 'justify-start whitespace-normal text-left font-semibold text-secondary-foreground hover:bg-menu-header [&_svg]:text-muted-foreground',
        menuDirect: 'menu-direct justify-start whitespace-normal text-left [&_svg:last-child]:ml-auto',
      },
      size: {
        default: 'min-h-(--space-40) gap-sm px-(--space-14) py-sm',
        xs: "min-h-(--space-28) gap-xs px-sm py-xs text-xs [&_svg:not([class*='size-'])]:size-(--icon-sm)",
        sm: "min-h-(--space-32) gap-(--space-6) px-(--space-10) py-xs text-xs [&_svg:not([class*='size-'])]:size-(--icon-sm)",
        lg: 'min-h-(--space-48) gap-sm px-lg py-md text-base',
        icon: 'size-(--space-36)',
        'icon-xs': 'size-(--space-28)',
        'icon-sm': 'size-(--space-32)',
        'icon-lg': 'size-(--space-44)',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
