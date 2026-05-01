import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/context/AuthContext";
import { Loader2, Lock, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
  requireRole?: AppRole;
  requirePaid?: boolean;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireRole, requirePaid, requireAdmin }: Props) {
  const { isAuthed, isAdmin, isPaid, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthed) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <ForbiddenCard reason="Admin only" />;
  }
  if (requirePaid && !isPaid) {
    return <UpgradeCard />;
  }
  if (requireRole === "paid" && !isPaid) {
    return <UpgradeCard />;
  }
  if (requireRole === "admin" && !isAdmin) {
    return <ForbiddenCard reason="Admin only" />;
  }

  return <>{children}</>;
}

function ForbiddenCard({ reason }: { reason: string }) {
  return (
    <div className="container max-w-xl py-16 px-4">
      <Card className="studio-card p-8 text-center">
        <Lock className="w-10 h-10 text-primary mx-auto mb-4" />
        <h2 className="font-display text-xl font-bold mb-2">{reason}</h2>
        <p className="text-sm text-muted-foreground mb-5">You don't have permission to view this page.</p>
        <Button asChild><Link to="/">Back to Dashboard</Link></Button>
      </Card>
    </div>
  );
}

function UpgradeCard() {
  return (
    <div className="container max-w-xl py-16 px-4">
      <Card className="studio-card-gold p-8 text-center">
        <Crown className="w-10 h-10 text-primary mx-auto mb-4" />
        <h2 className="font-display text-xl font-bold mb-2">Paid feature</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Advanced plug-in chains and pro tools are available for paid members. Contact the studio admin to upgrade your account.
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild variant="outline"><Link to="/">Back</Link></Button>
          <Button asChild className="bg-gradient-gold text-primary-foreground"><Link to="/upgrade">Upgrade</Link></Button>
        </div>
      </Card>
    </div>
  );
}
