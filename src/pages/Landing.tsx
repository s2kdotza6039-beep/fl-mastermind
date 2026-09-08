import { Link } from "react-router-dom";
import {
  ArrowRight, Crown, MessageCircle, Disc3, Music2, KeyRound, Layers,
  UploadCloud, Sparkles, ShieldCheck, Globe2, Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Sensei Chat",
    desc: "A patient, engineer-grade AI mentor that explains the why behind every move — not just copy-paste settings.",
  },
  {
    icon: Disc3,
    title: "Mix & Master Coaches",
    desc: "From gain staging to true-peak limiting. Exact FL Studio menu paths and numbers for every stage.",
  },
  {
    icon: Music2,
    title: "Genre Playbooks",
    desc: "Amapiano, trap, afrobeat, gospel, house and beyond — style-specific targets for loudness, width and balance.",
  },
  {
    icon: KeyRound,
    title: "Key Detection",
    desc: "Lock the root note and align every 808, melody and vocal so the whole song sits in key.",
  },
  {
    icon: Layers,
    title: "Plugin Chain Builder",
    desc: "FL Studio chain templates matched to your edition — never recommended a plugin you don't own.",
  },
  {
    icon: UploadCloud,
    title: "Upload & Analyse",
    desc: "Drop in a bounce. Get objective measurements — LUFS, peak, dynamic range, stereo width — and a repair plan.",
  },
];

const STEPS = [
  { n: "01", title: "Tell Sensei your setup", desc: "Your FL Studio version, edition, genre and the plugins you own." },
  { n: "02", title: "Upload or describe your track", desc: "Either upload audio for objective analysis or just describe what you're hearing." },
  { n: "03", title: "Coach, fix, release", desc: "Follow the step-by-step plan, bounce, and re-check until every gate opens." },
];

const GENRES = ["Amapiano", "Trap", "Afrobeat", "Kwaito", "Gospel", "House", "Drill", "R&B", "Lo-fi"];

export default function Landing() {
  const { isAuthed } = useAuth();
  const cta = isAuthed ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container max-w-6xl flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center glow-gold">
              <Crown className="w-5 h-5 text-primary-foreground" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              Studio <span className="text-gold">Sensei</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <Link to="/status" className="hover:text-foreground transition-colors">Status</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-card transition-colors"
            >
              Sign in
            </Link>
            <Link
              to={cta}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {isAuthed ? "Open studio" : "Start free"} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[480px] w-[820px] rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="container max-w-6xl pt-20 pb-16 md:pt-28 md:pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Your AI FL Studio engineer &amp; mentor
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight max-w-3xl mx-auto">
            From idea to <span className="text-gold">international standard.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Studio Sensei is the AI music production coach that teaches you to mix, master and
            build hits inside FL Studio — with engineer-grade guidance, in every genre, from
            amapiano to trap.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={cta}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-gold px-7 py-3.5 text-base font-semibold text-primary-foreground hover:opacity-90 transition-opacity glow-gold"
            >
              Launch the studio <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border px-7 py-3.5 text-base font-medium hover:bg-card transition-colors"
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 text-xs text-muted-foreground/70">
            Free to start · No credit card · Built for FL Studio 21 / 2024+
          </p>
        </div>
      </section>

      {/* Genre strip */}
      <section className="border-y border-border/60 bg-card/30">
        <div className="container max-w-6xl py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <span className="font-display text-sm font-semibold text-foreground">Fluent in every scene:</span>
          {GENRES.map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" /> {g}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container max-w-6xl py-20 md:py-28">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-primary mb-2">The toolkit</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            Everything between you and a finished record
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="studio-card p-6 hover:border-primary/40 transition-colors">
              <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border/60 bg-card/20">
        <div className="container max-w-6xl py-20 md:py-28">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-primary mb-2">How it works</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold">Three steps to a better bounce</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="studio-card p-7">
                <div className="font-display text-4xl font-bold text-primary/30 mb-4">{s.n}</div>
                <h3 className="font-display text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="container max-w-6xl py-20 md:py-24">
        <div className="studio-card-gold p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center gap-8">
          <div className="flex-1">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
              Your tracks stay <span className="text-gold">yours</span>.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Uploads never transfer ownership, we never distribute your music, and you can delete
              your data any time. Everything runs on your own Supabase project with row-level
              security — no AI model training on your audio.
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full md:w-auto">
            {[
              { icon: ShieldCheck, label: "Privacy & security", to: "/security" },
              { icon: Globe2, label: "Ownership", to: "/ownership" },
              { icon: Crown, label: "How we protect you", to: "/trust" },
            ].map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="inline-flex items-center gap-2.5 rounded-lg border border-primary/25 bg-background/40 px-4 py-2.5 text-sm font-medium hover:bg-background/70 transition-colors"
              >
                <l.icon className="w-4 h-4 text-primary" /> {l.label} <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container max-w-6xl pb-24">
        <div className="text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold max-w-2xl mx-auto">
            Your next mix could be <span className="text-gold">the one</span>.
          </h2>
          <p className="mt-5 text-muted-foreground max-w-xl mx-auto">
            Stop guessing at frequencies and loudness. Let an engineer-grade mentor walk you
            through every decision.
          </p>
          <Link
            to={cta}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-gold px-8 py-4 text-base font-semibold text-primary-foreground hover:opacity-90 transition-opacity glow-gold"
          >
            {isAuthed ? "Open the studio" : "Start producing smarter"} <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="container max-w-6xl py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-gradient-gold flex items-center justify-center">
              <Crown className="w-4 h-4 text-primary-foreground" />
            </span>
            <span className="font-display font-bold">Studio <span className="text-gold">Sensei</span></span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link>
            <Link to="/ownership" className="hover:text-foreground transition-colors">Ownership</Link>
            <Link to="/security" className="hover:text-foreground transition-colors">Security</Link>
            <Link to="/trust" className="hover:text-foreground transition-colors">Trust</Link>
            <Link to="/status" className="hover:text-foreground transition-colors">Status</Link>
          </nav>
          <p className="text-xs text-muted-foreground/70">© {new Date().getFullYear()} Studio Sensei. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
