import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { LogOut, Database, Home, Settings, UserCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { data: user, isLoading } = useCurrentUser();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
        window.location.href = "/";
      },
      onError: () => {
        queryClient.clear();
        setLocation("/");
        window.location.href = "/";
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full bg-background items-center justify-center">
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      {user && (
        <aside className="w-64 border-r bg-sidebar flex flex-col hidden md:flex shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border/50">
          <div className="flex items-center gap-2 font-semibold text-sidebar-foreground">
            <Database className="h-5 w-5 text-primary" />
            <span>Instant Admin</span>
          </div>
        </div>

        <div className="flex-1 py-4 flex flex-col gap-1 px-2">
          <Link href="/">
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              data-testid="link-dashboard-home"
            >
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/connections">
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              data-testid="link-dashboard-connections"
            >
              <Database className="mr-2 h-4 w-4" />
              Connections
            </Button>
          </Link>
        </div>

        <div className="flex-1 py-4 flex flex-col gap-1 px-2">
          <Link href="/settings">
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              data-testid="link-dashboard-settings"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>

        <div className="p-4 border-t border-sidebar-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start text-sidebar-foreground px-2 h-10"
                data-testid="button-user-menu"
              >
                <UserCircle className="mr-2 h-5 w-5 text-sidebar-foreground/70" />
                <span className="truncate flex-1 text-left">{user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-secondary/30">
        <header className="h-14 border-b bg-background flex items-center justify-between px-4 md:hidden">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="h-5 w-5 text-primary" />
            <span>Instant Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
