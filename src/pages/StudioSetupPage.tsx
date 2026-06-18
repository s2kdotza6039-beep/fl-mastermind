import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sliders, Save, Loader2, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { useStudioSetup } from "@/context/StudioSetupContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface HistoryRow {
  id: string;
  fl_version: string | null;
  fl_edition: string | null;
  main_use: string | null;
  main_genre: string | null;
  skill_level: string | null;
  change_type: string;
  changed_at: string;
}

const FL_VERSIONS = ["FL Studio 20", "FL Studio 21", "FL Studio 24", "FL Studio 25", "Other / Not sure"];
const FL_EDITIONS = ["Fruity Edition", "Producer Edition", "Signature Bundle", "All Plugins Edition", "Trial Version", "Not sure"];
const MAIN_USE = ["Beat making", "Vocal recording", "Mixing", "Mastering", "Full production"];
const MAIN_GENRE = ["Hip-hop", "Trap", "Drill", "Kwaito", "Amapiano", "Afrobeat", "R&B", "Gospel", "House", "Pop", "Other"];
const SKILL = ["Beginner", "Intermediate", "Advanced"];

export default function StudioSetupPage() {
  const navigate = useNavigate();
  const { setup, loading, save } = useStudioSetup();
  const [flVersion, setFlVersion] = useState("");
  const [flEdition, setFlEdition] = useState("");
  const [mainUse, setMainUse] = useState("");
  const [mainGenre, setMainGenre] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (setup) {
      setFlVersion(setup.fl_version ?? "");
      setFlEdition(setup.fl_edition ?? "");
      setMainUse(setup.main_use ?? "");
      setMainGenre(setup.main_genre ?? "");
      setSkillLevel(setup.skill_level ?? "");
    }
  }, [setup]);

  const allFilled = flVersion && flEdition && mainUse && mainGenre && skillLevel;

  const onSave = async () => {
    if (!allFilled) {
      toast.error("Please fill in every field.");
      return;
    }
    setSaving(true);
    const { error } = await save({
      fl_version: flVersion,
      fl_edition: flEdition,
      main_use: mainUse,
      main_genre: mainGenre,
      skill_level: skillLevel,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Studio setup saved. Sensei will now tailor advice to your FL Studio version.");
    navigate("/");
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: string[],
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-input border-border"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="container max-w-3xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Personalize Sensei"
        title="FL Studio Setup"
        description="Tell Sensei your exact DAW so every recommendation matches the plugins and workflow you actually have."
        icon={<Sliders className="w-6 h-6" />}
      />

      <Card className="studio-card-gold p-6 md:p-8 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-5">
              {field("FL Studio Version", flVersion, setFlVersion, FL_VERSIONS, "Pick your version")}
              {field("FL Studio Edition", flEdition, setFlEdition, FL_EDITIONS, "Pick your edition")}
              {field("Main Use", mainUse, setMainUse, MAIN_USE, "What do you mostly do?")}
              {field("Main Genre", mainGenre, setMainGenre, MAIN_GENRE, "Your primary genre")}
              <div className="md:col-span-2">
                {field("Skill Level", skillLevel, setSkillLevel, SKILL, "Your experience")}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => navigate("/")}>Cancel</Button>
              <Button
                onClick={onSave}
                disabled={!allFilled || saving}
                className="bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Setup
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
