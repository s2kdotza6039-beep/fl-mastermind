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
          <Link to="/ownership" className="hover:text-primary">Ownership</Link>
          <Link to="/security" className="hover:text-primary">Security</Link>
          <Link to="/status" className="hover:text-primary">Status</Link>
          <Link to="/privacy" className="hover:text-primary">Privacy (POPIA)</Link>
          <Link to="/terms" className="hover:text-primary">Terms</Link>
          <Link to="/feedback" className="hover:text-primary">Feedback</Link>
        </div>
      </div>
    </footer>
  );
}
