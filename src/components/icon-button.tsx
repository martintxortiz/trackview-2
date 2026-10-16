'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const iconClass = 'size-4 shrink-0'

export const iconButtonClass =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-0 p-0 transition-[color,background-color,transform] duration-100 ease-out active:scale-[0.96] focus-visible:ring-[2px] focus-visible:ring-ring/50 motion-reduce:transition-colors motion-reduce:active:scale-100'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  active?: boolean
  filled?: boolean
}

/** Single icon-button used by the top bar and dock. */
export function IconButton({ children, active, filled, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={[
        iconButtonClass,
        filled
          ? ''
          : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        active && !filled ? 'bg-secondary text-foreground hover:bg-secondary' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
