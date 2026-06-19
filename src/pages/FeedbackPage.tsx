import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Bug, Lightbulb, MessageCircle, Star, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

type FType = "bug" | "feature" | "general";

interface FeedbackRow {
  id: string;
  type: FType;
  rating: number | null;
  message: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const [type, setType] = useState<FType>("general");
  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("beta_feedback")
      .select("id, type, rating, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as FeedbackRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [user]);

  async function submit() {
    if (!user) return;
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      toast.error("Please add a little more detail.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("beta_feedback").insert({
      user_id: user.id,
      type,
      rating: rating > 0 ? rating : null,
      message: trimmed,
      page_url: typeof window !== "undefined" ? window.location.href : null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Thanks! Your feedback was received.");
    setMessage(""); setRating(0); setType("general");
    load();
  }

  return (
    <div className="container max-w-3xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Beta"
        title="Beta Feedback"
        description="Help shape Studio Sensei. Report a bug, request a feature, or share what's working."
        icon={<MessageSquare className="w-6 h-6" />}
      />

      <Card className="studio-card p-6 mb-6">
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Type</label>
            <Select value={type} onValueChange={(v) => setType(v as FType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug"><Bug className="w-3.5 h-3.5 inline mr-2" />Bug report</SelectItem>
                <SelectItem value="feature"><Lightbulb className="w-3.5 h-3.5 inline mr-2" />Feature request</SelectItem>
                <SelectItem value="general"><MessageCircle className="w-3.5 h-3.5 inline mr-2" />General feedback</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Rating (optional)</label>
            <div className="flex gap-1 mt-2" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className="p-1 rounded hover:bg-muted"
                >
                  <Star className={`w-5 h-5 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground/50"}`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="text-xs uppercase tracking-widest text-muted-foreground">Message</label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened, what you expected, and how to reproduce it (if it's a bug)…"
          rows={5}
          maxLength={2000}
          className="mt-1"
        />
        <div className="text-[10px] text-muted-foreground text-right mt-1">{message.length}/2000</div>

        <Button onClick={submit} disabled={submitting} className="mt-2">
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Submit feedback
        </Button>
      </Card>

      <h2 className="font-display text-lg font-bold mb-3">Your feedback</h2>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : items.length === 0 ? (
        <Card className="studio-card p-6 text-center text-sm text-muted-foreground">
          No feedback yet. Once you submit something it'll show up here with its status.
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <Card key={f.id} className="studio-card p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{f.type}</Badge>
                  {f.rating && <span className="text-xs text-primary">{"★".repeat(f.rating)}</span>}
                </div>
                <StatusBadge status={f.status} />
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{f.message}</p>
              <div className="text-[10px] text-muted-foreground/60 mt-2">{new Date(f.created_at).toLocaleString()}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FeedbackRow["status"] }) {
  const map = {
    open: { v: "secondary", label: "Open" },
    in_progress: { v: "default", label: "In progress" },
    resolved: { v: "outline", label: "Resolved" },
  } as const;
  const s = map[status];
  return <Badge variant={s.v as any}>{s.label}</Badge>;
}
