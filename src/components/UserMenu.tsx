import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LogOut, Shield, User as UserIcon, Crown } from "lucide-react";

export function UserMenu() {
  const { user, isAdmin, isPaid, signOut } = useAuth();
  const nav = useNavigate();

  if (!user) {
    return (
      <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground">
        <Link to="/auth">Sign in</Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserIcon className="w-4 h-4" />
          <span className="hidden sm:inline max-w-[120px] truncate">{user.email}</span>
          {isAdmin && <Badge variant="default" className="text-[10px] py-0">Admin</Badge>}
          {!isAdmin && isPaid && <Badge variant="secondary" className="text-[10px] py-0">Paid</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem onClick={() => nav("/admin")}>
            <Shield className="w-4 h-4 mr-2" /> Admin Dashboard
          </DropdownMenuItem>
        )}
        {!isPaid && (
          <DropdownMenuItem onClick={() => nav("/upgrade")}>
            <Crown className="w-4 h-4 mr-2" /> Upgrade to Paid
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await signOut(); nav("/auth"); }}>
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
