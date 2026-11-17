export type Variant = 'primary' | 'secondary' | 'ghost' | 'icon'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  // The fill of the surface it sits on: forest with cream text on light, lime with ink text inside .tone-dark.
  primary: 'btn-primary',
  // An outline pill in the surface's strong colour (forest on light, cream on dark).
  secondary: 'btn-secondary',
  // Text only, a faint fill on hover.
  ghost: 'btn-ghost',
  // A round, icon-only primary button: 48px, or 44px with size="sm" (the product card's add button). Always give it an aria-label.
  icon: 'btn-primary !min-h-0 !rounded-full !p-0',
}

/** Every button is at least 48px tall; `lg` is 56px. Sizes, colours and states live in index.css (.btn*). */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className = ''): string {
  const sizing = variant === 'icon' ? (size === 'sm' ? '!size-[44px]' : '!size-tap') : size === 'lg' ? 'btn-lg' : size === 'sm' ? 'btn-sm' : ''
  return ['btn', variants[variant], sizing, className].filter(Boolean).join(' ')
}
