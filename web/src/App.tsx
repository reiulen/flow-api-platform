import React, { useState, useEffect } from "react"
import { AppSidebar, type NavItem } from "@/components/dashboard/app-sidebar"
import { AffiliateStudio } from "@/components/dashboard/affiliate-studio"
import { CampaignLibrary } from "@/components/dashboard/campaign-library"
import { NichePresets } from "@/components/dashboard/niche-presets"
import { AccountsView } from "@/components/dashboard/accounts-view"
import { JobsQueue } from "@/components/dashboard/jobs-queue"
import { ApiView } from "@/components/dashboard/api-view"
import { CreditsDialog } from "@/components/dashboard/credits-dialog"
import { ApiKeyDialog } from "@/components/dashboard/api-key-dialog"
import { api, type CreditsSummary, type Account, type Job } from "@/lib/api"

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Zap,
  ExternalLink,
  Sun,
  Moon
} from "lucide-react"

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>("studio")
  const [isDark, setIsDark] = useState<boolean>(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })

  const [creditsSummary, setCreditsSummary] = useState<CreditsSummary | null>(null)
  const [creditsTotal, setCreditsTotal] = useState<number>(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [isCreditsDialogOpen, setIsCreditsDialogOpen] = useState<boolean>(false)
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)

  // Apply dark mode class to html element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [isDark])

  const loadData = async () => {
    setIsRefreshing(true)
    try {
      const [fetchedCredits, fetchedAccounts, fetchedJobs] = await Promise.all([
        api.getCredits().catch(() => null),
        api.getAccounts().catch(() => []),
        api.getJobs().catch(() => []),
      ])

      if (fetchedCredits) {
        setCreditsSummary(fetchedCredits)
        setCreditsTotal(fetchedCredits.totalCreditsRemaining || 0)
      }
      setAccounts(fetchedAccounts)
      setJobs(fetchedJobs)
    } catch (e) {
      console.error("Error loading data from Flow API:", e)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getPageTitle = (nav: NavItem) => {
    switch (nav) {
      case "studio":
        return "Affiliate studio"
      case "library":
        return "Campaign library"
      case "presets":
        return "Niche formulas"
      case "accounts":
        return "Accounts pool"
      case "jobs":
        return "Job queue"
      case "api":
        return "Developer API"
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isDark={isDark}
        setIsDark={setIsDark}
        creditsTotal={creditsTotal}
        onOpenCredits={() => setIsCreditsDialogOpen(true)}
        onOpenApiKey={() => setIsApiKeyDialogOpen(true)}
      />

      <SidebarInset className="bg-background">
        {/* Utilitarian Developer Top Chrome (52px) */}
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-4 bg-background sticky top-0 z-20">
          {/* Left: Trigger & Clean Context Hierarchy */}
          <div className="flex items-center gap-2">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground size-7 -ml-1" />
            <Separator orientation="vertical" className="h-4 bg-border" />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-normal">Platform</span>
              <span className="text-muted-foreground/40 font-mono">/</span>
              <h1 className="font-medium text-foreground tracking-tight">
                {getPageTitle(activeNav)}
              </h1>
            </div>
          </div>

          {/* Right: Docs Link, Credit Pool, Theme Toggle */}
          <div className="flex items-center gap-2">
            <a
              href="http://127.0.0.1:8787/docs"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-surface-hover"
            >
              <span>API reference</span>
              <ExternalLink className="size-3 opacity-60" />
            </a>

            {/* Credit Pool Indicator */}
            <button
              type="button"
              onClick={() => setIsCreditsDialogOpen(true)}
              className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-surface-hover transition-colors flex items-center gap-1.5 text-xs font-mono text-foreground cursor-pointer select-none"
              title="View account pool quota"
            >
              <Zap className="size-3 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {creditsTotal > 0 ? creditsTotal.toLocaleString() : "0"}
              </span>
              <span className="text-[10px] text-muted-foreground font-sans">credits</span>
            </button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsDark(!isDark)}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>
          </div>
        </header>

        {/* Utilitarian Workstation Viewport */}
        <main className="flex-1 w-full px-6 py-6 md:px-8 max-w-[1400px]">
          {activeNav === "studio" && <AffiliateStudio />}
          {activeNav === "library" && <CampaignLibrary />}
          {activeNav === "presets" && (
            <NichePresets
              onApplyPreset={(_nicheId, _dur) => {
                setActiveNav("studio")
              }}
            />
          )}
          {activeNav === "accounts" && (
            <AccountsView
              accounts={accounts}
              onRefresh={loadData}
              onOpenCredits={() => setIsCreditsDialogOpen(true)}
              onSyncAccountCredits={async (accId) => {
                await api.refreshCredits(accId);
                loadData();
              }}
            />
          )}
          {activeNav === "jobs" && (
            <JobsQueue
              jobs={jobs}
              onRefresh={loadData}
            />
          )}
          {activeNav === "api" && <ApiView />}
        </main>
      </SidebarInset>

      {/* Credits Breakdown Dialog */}
      <CreditsDialog
        open={isCreditsDialogOpen}
        onOpenChange={setIsCreditsDialogOpen}
        creditsSummary={creditsSummary}
        onCreditsUpdated={(updated) => {
          setCreditsSummary(updated)
          setCreditsTotal(updated.totalCreditsRemaining || 0)
        }}
      />

      {/* API Key Modal Dialog */}
      <ApiKeyDialog
        open={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
      />
    </SidebarProvider>
  )
}

export default App
