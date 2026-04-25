import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Wrench, Disc3, Music2,
  Sliders, Volume2, Layers, ListChecks, UploadCloud, Crown,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const NAV = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, group: "Studio" },
  { title: "Sensei Chat", url: "/chat", icon: MessageCircle, group: "Studio" },
  { title: "Quick Fixes", url: "/quick", icon: Wrench, group: "Coach" },
  { title: "Mix Problems", url: "/problems", icon: Disc3, group: "Coach" },
  { title: "Genre Mode", url: "/genre", icon: Music2, group: "Coach" },
  { title: "Production Coach", url: "/production", icon: Sliders, group: "Coach" },
  { title: "Mixing Coach", url: "/mixing", icon: Volume2, group: "Coach" },
  { title: "Mastering Coach", url: "/mastering", icon: Crown, group: "Coach" },
  { title: "Plugin Chain Builder", url: "/chains", icon: Layers, group: "Tools" },
  { title: "Session Checklist", url: "/checklist", icon: ListChecks, group: "Tools" },
  { title: "Upload Audio", url: "/upload", icon: UploadCloud, group: "Tools" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const groups = ["Studio", "Coach", "Tools"] as const;

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

        {groups.map((g) => (
          <SidebarGroup key={g}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] tracking-widest uppercase text-muted-foreground/70 font-semibold">
                {g}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.filter((n) => n.group === g).map((item) => {
                  const active = location.pathname === item.url;
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
                          {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
