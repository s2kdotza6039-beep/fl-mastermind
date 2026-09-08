import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ShieldCheck, Lock, Database, UserCheck, LifeBuoy, ArrowRight } from "lucide-react";

const PILLARS = [
  {
    icon: Lock,
    title: "Row-level security",
    desc: "Every table in the database is protected with row-level security policies, so a user can only ever read or write their own data.",
  },
  {
    icon: ShieldCheck,
    title: "No secret keys in the app",
    desc: "The browser only ever holds a publishable (anon) key. Service-role access lives exclusively inside server-side edge functions.",
  },
  {
    icon: Database,
    title: "You can delete everything",
    desc: "Audio reports, projects and your account can be removed at any time. Soft-deleted audio is permanently purged on a fixed schedule.",
  },
  {
    icon: UserCheck,
    title: "Your music stays yours",
    desc: "Uploading audio does not transfer ownership of any kind, and Studio Sensei never distributes your music to any platform.",
  },
  {
    icon: LifeBuoy,
    title: "Public status",
    desc: "Incidents and maintenance are published openly on the status page, including an RSS and JSON feed.",
  },
];

export default function TrustPage() {
  return (
    <div className="container max-w-3xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Trust"
        title="How Studio Sensei protects you"
        description="The short version of how we handle your data, your music and your privacy."
        icon={<ShieldCheck className="w-6 h-6" />}
      />
      <div className="grid gap-4 mt-6">
        {PILLARS.map((p) => (
          <div key={p.title} className="studio-card p-5 flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <p.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm mb-1">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          { label: "Security practices", to: "/security" },
          { label: "Privacy policy", to: "/privacy" },
          { label: "Ownership & licensing", to: "/ownership" },
          { label: "Terms & conditions", to: "/terms" },
          { label: "Live status & incidents", to: "/status" },
        ].map((l) => (
          <Link
            key={l.label}
            to={l.to}
            className="inline-flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-card transition-colors"
          >
            {l.label} <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Questions about how your data is handled? Reach out through the{" "}
        <Link to="/feedback" className="text-primary underline underline-offset-2">in-app feedback</Link>{" "}
        or contact the studio admin.
      </p>
    </div>
  );
}
