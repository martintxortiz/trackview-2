'use client'

import { useState } from 'react'
import {
  IconBellFilled,
  IconBroadcast,
  IconChevronLeft,
  IconKeyframesFilled,
} from '@tabler/icons-react'
import { Toolbar, ToolbarFrame, type ToolbarTab } from '@/components/toolbar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  iconActionClass,
  liveActionBaseClass,
  toolbarIconClass,
} from '@/components/icon-action'

const SECTION_TABS: ToolbarTab[] = [
  { id: 'telemetry', label: 'Overview' },
  { id: 'session', label: 'Session' },
  { id: 'lap', label: 'Lap' },
  { id: 'logs', label: 'Dynamics' },
  { id: 'usage', label: 'Usage' },
  { id: 'setup', label: 'Setup' },
  { id: 'coach', label: 'Coach' },
]

export function TopBar() {
  const [activeId, setActiveId] = useState('telemetry')
  const [isLive, setIsLive] = useState(true)

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <ToolbarFrame className="shrink-0 gap-1">
        <button type="button" className={iconActionClass} aria-label="Back">
          <IconChevronLeft className={toolbarIconClass} aria-hidden />
        </button>
        <button
          type="button"
          className={[
            liveActionBaseClass,
            isLive
              ? 'bg-[var(--tv-live)] text-white/90 hover:brightness-110'
              : 'bg-secondary text-muted-foreground hover:text-foreground/80',
          ].join(' ')}
          aria-label={isLive ? 'Live' : 'Replay'}
          aria-pressed={isLive}
          onClick={() => setIsLive((live) => !live)}
        >
          {isLive ? (
            <IconBroadcast className={toolbarIconClass} aria-hidden />
          ) : (
            <IconKeyframesFilled className={toolbarIconClass} aria-hidden />
          )}
        </button>
      </ToolbarFrame>
      <ToolbarFrame className="min-w-0 flex-1">
        <Toolbar
          label="Sections"
          tabs={SECTION_TABS}
          value={activeId}
          onValueChange={setActiveId}
        />
      </ToolbarFrame>
      <ToolbarFrame className="shrink-0 gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={iconActionClass}
            aria-label="More options"
          >
            <IconBellFilled className={toolbarIconClass} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Export data</DropdownMenuItem>
            <DropdownMenuItem>View documentation</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={iconActionClass}
            aria-label="Account menu"
          >
            <Avatar className="size-7">
              <AvatarImage src="https://api.dicebear.com/10.x/glyphs/svg?seed=bqiwb6hy" />
              <AvatarFallback>MO</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarFrame>
    </div>
  )
}
