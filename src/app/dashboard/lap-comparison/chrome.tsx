'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  IconCaretLeftFilled,
  IconCurrentLocationFilled,
  IconLogout,
  IconMinus,
  IconMoonFilled,
  IconPlus,
  IconSettingsFilled,
  IconSunFilled,
} from '@tabler/icons-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const AVATAR_SRC = 'https://api.dicebear.com/10.x/glass/svg?seed=92r5c90b'

const press =
  'cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

const CORNER_SIZE = 'size-9'

/**
 * Shared 36px corner button for lap comparison. Plain button, or avatar
 * menu trigger when `menu` is passed. oa-design pill rules: the press
 * (`translate-y-px + scale 0.98`) is the only geometry a pointer causes,
 * focus is a 3px ring, hover is color-only. Flat by intent — no shadow
 * anywhere on this screen's chrome.
 *
 * Both variants share the exact same shell (size, dim border, surface) —
 * the avatar image sits slightly smaller inside it.
 *
 * - `panel`: surface (`bg-card/85` + `backdrop-blur-sm`, dim ink hairline
 *   `border-foreground/10` — ink-based so it stays visible in light mode,
 *   where `--border` is transparent). Hover never touches the border —
 *   a circle wash lands behind the icon and the icon brightens.
 * - `avatar`: same shell with border; image inset so the shell matches
 *   the back button edge to edge.
 */
function shellCls(variant: 'panel' | 'avatar', className?: string) {
  return [
    `group relative flex ${CORNER_SIZE} shrink-0 items-center justify-center overflow-hidden rounded-full`,
    press,
    variant === 'panel'
      ? 'border border-foreground/10 bg-card/85 text-foreground/60 shadow-none backdrop-blur-sm hover:bg-foreground/10 hover:text-foreground'
      : 'border border-foreground/10 bg-card/85 shadow-none backdrop-blur-sm',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}
export function CornerButton({
  side,
  label,
  onClick,
  menu,
  variant = 'panel',
  className,
  children,
}: {
  side: 'left' | 'right'
  label: string
  onClick?: () => void
  menu?: ReactNode
  variant?: 'panel' | 'avatar'
  className?: string
  children: ReactNode
}) {
  const style: CSSProperties =
    side === 'left'
      ? { top: 16, left: 16, right: 'auto' }
      : { top: 16, right: 16, left: 'auto' }
  const cls = shellCls(variant, className)
  if (menu) {
    return (
      <div className="absolute z-20" style={style}>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={label} className={cls}>
            {children}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-50 origin-top-right rounded-2xl border-foreground/10 bg-card/85 p-1 text-card-foreground shadow-none backdrop-blur-sm"
          >
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }
  return (
    <div className="absolute z-20" style={style}>
      <button type="button" aria-label={label} onClick={onClick} className={cls}>
        {children}
      </button>
    </div>
  )
}

/** Outer dock shell: the capsule every floating control lives in. */
const dockShell =
  'rounded-full border border-foreground/5 bg-card/85 shadow-none backdrop-blur-sm'

/** Icon segment inside a dock: hover drops a circle wash behind the glyph. */
const dockSegment =
  `group flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-foreground/10 hover:text-foreground ${press}`

/** The one dock button. Back, zoom, tilt — all the same component. */
function DockButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={dockSegment}
    >
      {children}
    </button>
  )
}

/** Floating back button, top left. A single-icon dock: same shell and
 *  same DockButton as the bottom-left controls. */
export function BackButton() {
  const router = useRouter()
  return (
    <div className="absolute z-20" style={{ top: 16, left: 16 }}>
      <div className={`${dockShell} p-0.5`}>
        <DockButton label="Go back" onClick={() => router.back()}>
          <IconCaretLeftFilled className="size-5" aria-hidden />
        </DockButton>
      </div>
    </div>
  )
}

/** Floating zoom controls, bottom left. GPS rides above on its own;
 *  zoom in/out stay fused in one capsule. No functionality yet. */
export function BottomLeftControls() {
  const zoom = [
    { label: 'Zoom in', Icon: IconPlus },
    { label: 'Zoom out', Icon: IconMinus },
  ]
  return (
    <div
      className="absolute z-20 flex flex-col items-center gap-2"
      style={{ bottom: 16, left: 16 }}
    >
      <div className={`${dockShell} p-0.5`}>
        <DockButton label="Locate">
          <IconCurrentLocationFilled className="size-4" aria-hidden />
        </DockButton>
      </div>
      <div
        role="toolbar"
        aria-label="Map controls"
        className={`flex flex-col items-center gap-0.5 p-0.5 ${dockShell}`}
      >
        {zoom.map(({ label, Icon }) => (
          <DockButton key={label} label={label}>
            <Icon className="size-4" aria-hidden />
          </DockButton>
        ))}
      </div>
    </div>
  )
}

/** Account dropdown contents. Theme toggle + settings + red logout. */
function UserMenu() {
  const { resolvedTheme, setTheme } = useTheme()
  // False during SSR/hydration — match dark pre-hydration to avoid a flash.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const dark = mounted ? resolvedTheme !== 'light' : true
  // oa-design menu rows: 32px (h-8), rounded-lg, accent hover wash.
  const item =
    'h-8 gap-2.5 rounded-lg px-3 text-[13px] font-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground [&_svg]:text-muted-foreground'
  return (
    <>
      <DropdownMenuItem onClick={() => setTheme(dark ? 'light' : 'dark')} className={item}>
        {dark ? (
          <IconSunFilled className="size-4" aria-hidden />
        ) : (
          <IconMoonFilled className="size-4" aria-hidden />
        )}
        {dark ? 'Light mode' : 'Dark mode'}
      </DropdownMenuItem>
      <DropdownMenuItem className={item}>
        <IconSettingsFilled className="size-4" aria-hidden />
        Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator className="mx-2 my-1 bg-foreground/10" />
      <DropdownMenuItem
        variant="destructive"
        className="h-8 gap-2.5 rounded-lg px-3 text-[13px] font-normal hover:bg-destructive/10 focus:bg-destructive/10"
      >
        <IconLogout className="size-4" aria-hidden />
        Log out
      </DropdownMenuItem>
    </>
  )
}

/** Floating user avatar, top right. Same shell as the back button. */
export function UserBar() {
  return (
    <CornerButton
      side="right"
      label="Account menu"
      variant="avatar"
      menu={<UserMenu />}
    >
      <Avatar className="size-full rounded-full border-0 shadow-none">
        <AvatarImage className="rounded-full" src={AVATAR_SRC} alt="Account" />
        <AvatarFallback className="rounded-full">MO</AvatarFallback>
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-foreground/5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      </Avatar>
    </CornerButton>
  )
}
