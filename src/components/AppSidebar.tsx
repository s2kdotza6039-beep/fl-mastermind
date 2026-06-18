import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Wrench, Disc3, Music2,
  Sliders, Volume2, Layers, ListChecks, UploadCloud, Crown, KeyRound, Shield, Lock, Settings2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: any;
  group: "Studio" | "Coach" | "Tools" | "Admin";
  paid?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, group: "Studio" },
  { title: "Sensei Chat", url: "/chat", icon: MessageCircle, group: "Studio" },
  { title: "Quick Fixes", url: "/quick", icon: Wrench, group: "Coach" },
  { title: "Mix Problems", url: "/problems", icon: Disc3, group: "Coach" },
  { title: "Genre Mode", url: "/genre", icon: Music2, group: "Coach" },
  { title: "Production Coach", url: "/production", icon: Sliders, group: "Coach" },
  { title: "Mixing Coach", url: "/mixing", icon: Volume2, group: "Coach" },
  { title: "Mastering Coach", url: "/mastering", icon: Crown, group: "Coach" },
  { title: "Key Detection", url: "/key", icon: KeyRound, group: "Tools" },
  { title: "Plugin Chain Builder", url: "/chains", icon: Layers, group: "Tools", paid: true },
  { title: "Session Checklist", url: "/checklist", icon: ListChecks, group: "Tools" },
  { title: "Upload Audio", url: "/upload", icon: UploadCloud, group: "Tools" },
  { title: "FL Studio Setup", url: "/studio-setup", icon: Settings2, group: "Tools" },
  { title: "Admin", url: "/admin", icon: Shield, group: "Admin", adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isPaid, isAdmin } = useAuth();

  const groups = ["Studio", "Coach", "Tools", "Admin"] as const;
  const visible = NAV.filter((n) => (n.adminOnly ? isAdmin : true));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className={cn("px-4 py-5 border-b border-sidebar-border", collapsed && "px-2")}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center flex-shrink-0 glow-gold">
              <Crown className="w-5 h-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <h1 className="font-display font-bold text-base text-gold leading-tight">Studio Sensei</h1>
                <p className="text-[10px] text-muted-foreground tracking-wider uppercase">FL Studio Coach</p>
              </div>
            )}
          </div>
        </div>

        {groups.map((g) => {
          const items = visible.filter((n) => n.group === g);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={g}>
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] tracking-widest uppercase text-muted-foreground/70 font-semibold">
                  {g}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = location.pathname === item.url;
                    const locked = item.paid && !isPaid;
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            end
                            className={cn(
                              "flex items-center gap-3 rounded-lg transition-all duration-200",
                              active
                                ? "bg-gradient-gold-soft text-primary border border-primary/20"
                                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary",
                            )}
                          >
                            <item.icon className={cn("w-4 h-4 flex-shrink-0", active && "text-primary")} />
                            {!collapsed && (
                              <span className="text-sm font-medium flex items-center gap-1.5 flex-1">
                                {item.title}
                                {locked && <Lock className="w-3 h-3 text-primary/60" />}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
