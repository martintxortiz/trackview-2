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
import { IconButton, iconButtonClass, iconClass } from '@/components/icon-button'

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
    <div className="flex w-full min-w-0 items-center gap-1">
      <ToolbarFrame className="shrink-0 gap-1">
        <IconButton aria-label="Back">
          <IconChevronLeft className={iconClass} aria-hidden />
        </IconButton>
        <IconButton
          filled
          aria-label={isLive ? 'Live' : 'Replay'}
          aria-pressed={isLive}
          onClick={() => setIsLive((live) => !live)}
          className={
            isLive
              ? 'bg-[var(--tv-live)] text-white/90 hover:brightness-110'
              : 'bg-secondary text-muted-foreground hover:text-foreground/80'
          }
        >
          {isLive ? (
            <IconBroadcast className={iconClass} aria-hidden />
          ) : (
            <IconKeyframesFilled className={iconClass} aria-hidden />
          )}
        </IconButton>
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
          <DropdownMenuTrigger className={`${iconButtonClass} bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground`} aria-label="More options">
            <IconBellFilled className={iconClass} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Export data</DropdownMenuItem>
            <DropdownMenuItem>View documentation</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className={`${iconButtonClass} bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground`} aria-label="Account menu">
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
