'use client'

/**
 * Lap-comparison chrome — back, account, compass/zoom/locate.
 * Zoom/locate call ComparisonProvider chrome callbacks (view ref).
 * Settings / Log out are labeled disabled (no auth surface yet).
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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
import { useComparison } from '@/features/lap-comparison/store'
import { orientationFor } from '@/features/viewer'

/** Tick count around the compass ring (N is the red triangle, not a dot). */
const COMPASS_TICKS = 16

const AVATAR_SRC = 'https://api.dicebear.com/10.x/glass/svg?seed=92r5c90b'

const press =
  'cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

const CORNER_SIZE = 'size-9'

/**
 * Shared 36px corner button. oa-design pill rules: press
 * (`translate-y-px + scale 0.98`) is the only geometry a pointer causes,
 * focus is a 3px ring, hover is color-only. Flat — no shadow.
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

const dockShell =
  'rounded-full border border-foreground/5 bg-card/85 shadow-none backdrop-blur-sm'

const dockSegment =
  `group flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-foreground/10 hover:text-foreground ${press}`

function DockButton({
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`${dockSegment}${disabled ? ' cursor-not-allowed opacity-40 hover:bg-transparent hover:text-foreground/60' : ''}`}
    >
      {children}
    </button>
  )
}

/** Floating back button, top left. */
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

/**
 * North indicator — N, tick ring, red tip at 12 o'clock.
 * Rotates with track orientation so N stays geographic north on screen.
 * Sits in the same frosted dock shell as locate / zoom.
 */
function CompassRose({ degrees }: { degrees: number }) {
  // 16 slots: 0 = N (red tip), 4/8/12 = E/S/W (brighter), rest = dim ticks.
  const ticks = Array.from({ length: COMPASS_TICKS }, (_, i) => {
    if (i === 0) return null
    const cardinal = i % (COMPASS_TICKS / 4) === 0
    const a = (i * 360) / COMPASS_TICKS
    const rad = ((a - 90) * Math.PI) / 180
    const r = 10.5
    return (
      <circle
        key={i}
        cx={14 + Math.cos(rad) * r}
        cy={14 + Math.sin(rad) * r}
        r={cardinal ? 1.05 : 0.75}
        fill="currentColor"
        opacity={cardinal ? 0.85 : 0.35}
      />
    )
  })

  return (
    <svg
      viewBox="0 0 28 28"
      className="size-8 text-foreground/60"
      style={{ transform: `rotate(${degrees}deg)` }}
      aria-hidden
    >
      {ticks}
      <polygon points="14,2.4 15.7,5.4 12.3,5.4" fill="#e11d2e" />
      <text
        x="14"
        y="16"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        style={{ fontSize: 11, fontWeight: 600, fontFamily: 'system-ui, sans-serif' }}
      >
        N
      </text>
    </svg>
  )
}

/** Screen angle of the pointer relative to an element center (deg, atan2). */
function pointerAngle(e: { clientX: number; clientY: number }, el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
}

/**
 * Compass control — click eases back to catalog north;
 * drag sets a spin target that eases like the camera (viewport-centered).
 */
function CompassControl() {
  const { state, spin, derived } = useComparison()
  const [roseDeg, setRoseDeg] = useState(
    () => state.rotate + (state.flipV ? 180 : 0),
  )
  const drag = useRef<{
    pointerId: number
    startAngle: number
    startRotate: number
    moved: boolean
  } | null>(null)

  // Rose follows smoothed spin current — same damping as the track.
  useEffect(() => {
    let id = 0
    const loop = () => {
      const catalog = orientationFor(state.trackId).rotate
      const offset = derived.spinCurrentRef.current
      setRoseDeg(catalog + offset + (state.flipV ? 180 : 0))
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [state.trackId, state.flipV, derived.spinCurrentRef])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    spin.begin()
    const catalog = orientationFor(state.trackId).rotate
    drag.current = {
      pointerId: e.pointerId,
      startAngle: pointerAngle(e, e.currentTarget),
      startRotate: catalog + derived.spinCurrentRef.current,
      moved: false,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const angle = pointerAngle(e, e.currentTarget)
    // atan2 grows CCW; clockwise screen drag → positive track rotate.
    const delta = d.startAngle - angle
    if (Math.abs(delta) > 2) d.moved = true
    if (!d.moved) return
    spin.preview(delta)
  }

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (!d.moved) {
      spin.reset()
      return
    }
    const angle = pointerAngle(e, e.currentTarget)
    const delta = d.startAngle - angle
    spin.commit(d.startRotate + delta)
  }

  return (
    <button
      type="button"
      aria-label="Reset map north. Drag to rotate."
      title="Reset north · drag to rotate"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`${dockShell} ${press} flex size-9 shrink-0 touch-none items-center justify-center p-0.5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground`}
    >
      <CompassRose degrees={roseDeg} />
    </button>
  )
}

/** Zoom + locate + compass — wired to ComparisonProvider view callbacks. */
export function BottomLeftControls() {
  const { chrome } = useComparison()

  return (
    <div
      className="absolute z-20 flex flex-col items-center gap-2"
      style={{ bottom: 16, left: 16 }}
    >
      <CompassControl />
      <div className={`${dockShell} p-0.5`}>
        <DockButton label="Locate" title="Fit track in view" onClick={chrome.locate}>
          <IconCurrentLocationFilled className="size-4" aria-hidden />
        </DockButton>
      </div>
      <div
        role="toolbar"
        aria-label="Map controls"
        className={`flex flex-col items-center gap-0.5 p-0.5 ${dockShell}`}
      >
        <DockButton label="Zoom in" onClick={chrome.zoomIn}>
          <IconPlus className="size-4" aria-hidden />
        </DockButton>
        <DockButton label="Zoom out" onClick={chrome.zoomOut}>
          <IconMinus className="size-4" aria-hidden />
        </DockButton>
      </div>
    </div>
  )
}

function UserMenu() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const dark = mounted ? resolvedTheme !== 'light' : true
  const item =
    'h-8 gap-2.5 rounded-lg px-3 text-[13px] font-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground [&_svg]:text-muted-foreground'
  const disabledItem =
    'h-8 gap-2.5 rounded-lg px-3 text-[13px] font-normal text-muted-foreground/50 opacity-60'
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
      <DropdownMenuItem
        disabled
        className={disabledItem}
        title="No settings surface yet"
      >
        <IconSettingsFilled className="size-4" aria-hidden />
        Settings (unavailable)
      </DropdownMenuItem>
      <DropdownMenuSeparator className="mx-2 my-1 bg-foreground/10" />
      <DropdownMenuItem
        disabled
        variant="destructive"
        className="h-8 gap-2.5 rounded-lg px-3 text-[13px] font-normal opacity-60"
        title="Auth not wired on this route"
      >
        <IconLogout className="size-4" aria-hidden />
        Log out (unavailable)
      </DropdownMenuItem>
    </>
  )
}

/** Floating user avatar, top right. */
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
