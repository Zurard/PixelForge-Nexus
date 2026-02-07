'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  LogOut,
  Shield,
  Menu,
  ChevronRight,
} from 'lucide-react';
import type { AppRole } from '@/types/database';

interface UserInfo {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  avatar_url?: string | null;
}

interface DashboardShellProps {
  user: UserInfo;
  children: React.ReactNode;
}

const roleColors: Record<AppRole, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  project_lead: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  developer: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  project_lead: 'Project Lead',
  developer: 'Developer',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function NavItems({ user, pathname }: { user: UserInfo; pathname: string }) {
  const items = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'project_lead', 'developer'] as AppRole[],
    },
    {
      href: '/dashboard/projects',
      label: 'Projects',
      icon: FolderKanban,
      roles: ['admin', 'project_lead', 'developer'] as AppRole[],
    },
    {
      href: '/dashboard/admin/users',
      label: 'User Management',
      icon: Users,
      roles: ['admin'] as AppRole[],
    },
    {
      href: '/dashboard/settings',
      label: 'Settings',
      icon: Settings,
      roles: ['admin', 'project_lead', 'developer'] as AppRole[],
    },
  ];

  return (
    <nav className="space-y-1">
      {items
        .filter((item) => item.roles.includes(user.role))
        .map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          );
        })}
    </nav>
  );
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-bold leading-none">PixelForge</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Nexus</p>
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <div className="flex-1 px-3 py-4">
        <NavItems user={user} pathname={pathname} />
      </div>

      <Separator />

      {/* User */}
      <div className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent transition-colors">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs font-semibold">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name}</p>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${roleColors[user.role]}`}>
                  {roleLabels[user.role]}
                </Badge>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm">{user.full_name}</p>
              <p className="text-xs text-muted-foreground font-normal">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await signOut();
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            {sidebar}
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <span className="font-bold">PixelForge Nexus</span>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:border-r lg:bg-card min-h-screen sticky top-0">
          {sidebar}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="container max-w-6xl mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
