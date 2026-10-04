import * as React from "react"
import {
  Video,
  Film,
  SlidersHorizontal,
  Code2,
  ChevronsUpDown,
  Users,
  Layers,
  Plus,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

export type NavItem = "studio" | "library" | "presets" | "accounts" | "jobs" | "api"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeNav: NavItem
  setActiveNav: (nav: NavItem) => void
  isDark: boolean
  setIsDark: (dark: boolean) => void
  creditsTotal: number
  onOpenCredits?: () => void
  onOpenApiKey?: () => void
}

export function AppSidebar({
  activeNav,
  setActiveNav,
  isDark: _isDark,
  setIsDark: _setIsDark,
  creditsTotal,
  onOpenCredits,
  onOpenApiKey: _onOpenApiKey,
  ...props
}: AppSidebarProps) {
  const studioNavigation = [
    {
      id: "studio" as NavItem,
      title: "Affiliate studio",
      icon: Video,
      badge: undefined,
    },
    {
      id: "library" as NavItem,
      title: "Campaign library",
      icon: Film,
      badge: "4",
    },
    {
      id: "presets" as NavItem,
      title: "Niche formulas",
      icon: SlidersHorizontal,
      badge: "6",
    },
  ]

  const platformNavigation = [
    {
      id: "accounts" as NavItem,
      title: "Accounts pool",
      icon: Users,
      badge: "2",
      badgeDot: true,
    },
    {
      id: "jobs" as NavItem,
      title: "Job queue",
      icon: Layers,
      badge: "0",
    },
    {
      id: "api" as NavItem,
      title: "Developer API",
      icon: Code2,
      badge: "v1",
    },
  ]

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar" {...props}>
      {/* Brand Workspace Header: Exact 52px height with vertically centered logo */}
      <SidebarHeader className="h-[52px] px-3.5 flex flex-row items-center border-b border-border shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-6 rounded-md bg-foreground text-background flex items-center justify-center font-bold text-[11px] shrink-0 tracking-tight shadow-xs">
            FL
          </div>
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-xs font-semibold tracking-tight text-foreground leading-none">
              Flow Studio
            </span>
            <span className="text-[10px] text-muted-foreground tracking-tight leading-none mt-1">
              Affiliate Engine
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation Content */}
      <SidebarContent className="px-2 py-2 flex flex-col gap-1">
        {/* Primary Action Button */}
        <div className="pt-1 pb-1.5 px-0.5 group-data-[collapsible=icon]:px-0">
          <Button
            size="sm"
            onClick={() => setActiveNav("studio")}
            className="w-full h-8 justify-start px-2.5 text-xs font-medium gap-2 shadow-xs group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <Plus className="size-3.5" />
            <span className="group-data-[collapsible=icon]:hidden">New video</span>
          </Button>
        </div>

        {/* Studio Submenu */}
        <SidebarGroup className="p-0 mt-1">
          <SidebarGroupLabel className="h-5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5 group-data-[collapsible=icon]:hidden">
            Studio
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {studioNavigation.map((item) => {
                const Icon = item.icon
                const isActive = activeNav === item.id
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setActiveNav(item.id)}
                      tooltip={item.title}
                      className={`text-xs h-8 rounded-md transition-colors px-2.5 ${
                        isActive
                          ? "bg-surface-active text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <SidebarMenuBadge>
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground leading-none">
                            {item.badge}
                          </span>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Platform Submenu (tight top margin: mt-2.5) */}
        <SidebarGroup className="p-0 mt-2.5">
          <SidebarGroupLabel className="h-5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5 group-data-[collapsible=icon]:hidden">
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNavigation.map((item) => {
                const Icon = item.icon
                const isActive = activeNav === item.id
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setActiveNav(item.id)}
                      tooltip={item.title}
                      className={`text-xs h-8 rounded-md transition-colors px-2.5 ${
                        isActive
                          ? "bg-surface-active text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <SidebarMenuBadge>
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground leading-none">
                            {item.badgeDot && (
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                            )}
                            {item.badge}
                          </span>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Quota & Generation Resource Usage Card */}
        <div className="mt-auto pt-2 group-data-[collapsible=icon]:hidden">
          <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Generation pool</span>
              <span className="font-mono font-semibold text-foreground">
                {creditsTotal > 0 ? creditsTotal.toLocaleString() : "0"} cr
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(15, (creditsTotal / 5000) * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                2 accounts active
              </span>
              <button
                type="button"
                onClick={onOpenCredits}
                className="text-foreground hover:underline cursor-pointer font-medium"
              >
                Quota &rarr;
              </button>
            </div>
          </div>
        </div>
      </SidebarContent>

      {/* User Identity Footer */}
      <SidebarFooter className="p-2 border-t border-border">
        <div className="flex items-center justify-between px-1.5 py-1 rounded-md hover:bg-surface-hover transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-6 rounded-full bg-surface-subtle border border-border text-foreground font-semibold text-[10px] flex items-center justify-center shrink-0">
              RP
            </div>
            <div className="truncate group-data-[collapsible=icon]:hidden">
              <div className="text-xs font-medium text-foreground truncate leading-tight">Reihan Praja</div>
              <div className="text-[10px] text-muted-foreground truncate leading-tight">Workspace default</div>
            </div>
          </div>
          <ChevronsUpDown className="size-3 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
