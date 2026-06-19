import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrackSession } from "@/context/TrackSessionContext";
import { toast } from "sonner";

interface Props {
  reportId: string;
  fileName?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  redirectTo?: string;
  className?: string;
  label?: string;
}

export const CoachThisTrackButton = ({
  reportId,
  fileName,
  variant = "outline",
  size = "sm",
  redirectTo = "/chat",
  className,
  label = "Coach this track",
}: Props) => {
  const { setActiveReport, active } = useTrackSession();
  const navigate = useNavigate();
  const isActive = active?.id === reportId;

  return (
    <Button
      variant={isActive ? "secondary" : variant}
      size={size}
      className={className}
      onClick={async () => {
        await setActiveReport(reportId);
        toast.success(`Sensei is now coaching about ${fileName ?? "this track"}`);
        if (redirectTo) navigate(redirectTo);
      }}
    >
      <MessageCircle className="w-3 h-3 mr-1" />
      {isActive ? "Active · Open chat" : label}
    </Button>
  );
};
