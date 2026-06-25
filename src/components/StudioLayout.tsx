import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { SessionHeader } from "./SessionHeader";
import { ActiveProjectChip } from "./ActiveProjectChip";
import { UserMenu } from "./UserMenu";
import { Footer } from "./Footer";

export const StudioLayout = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border flex items-center px-4 bg-card/40 backdrop-blur sticky top-0 z-30">
            <SidebarTrigger className="text-muted-foreground hover:text-primary" />
            <div className="ml-3 flex-1 min-w-0">
              <SessionHeader />
            </div>
            <div className="ml-3 flex-shrink-0 flex items-center gap-2">
              <ActiveProjectChip />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto scrollbar-thin">
            {children}
            <Footer />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
