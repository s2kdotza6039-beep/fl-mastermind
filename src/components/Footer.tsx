import { Link } from "react-router-dom";
import { Crown } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border mt-12 px-4 md:px-8 py-6 text-xs text-muted-foreground">
      <div className="container max-w-7xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-primary" />
          <span>© {year} Studio Sensei. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link to="/terms" className="hover:text-primary">Terms</Link>
          <Link to="/privacy" className="hover:text-primary">Privacy (POPIA)</Link>
          <span className="hidden sm:inline">No copying · No resale · No reverse engineering</span>
        </div>
      </div>
    </footer>
  );
}
