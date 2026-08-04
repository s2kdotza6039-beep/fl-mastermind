import { useState } from "react";
import { Languages } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ADVISOR_LANGUAGES, loadAdvisorLanguage, storeAdvisorLanguage } from "@/lib/advisor-language";

export const AdvisorLanguageCard = () => {
  const [lang, setLang] = useState(loadAdvisorLanguage());
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" /> Advisor language
        </CardTitle>
        <CardDescription>
          Sensei answers in this language. FL Studio plugin names and menu paths stay in English —
          that's what the buttons say.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value);
            storeAdvisorLanguage(e.target.value);
          }}
          className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          aria-label="Advisor language"
        >
          {ADVISOR_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native} ({l.label})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Quality of translation can vary outside the major languages — music terms may stay in
          English.
        </p>
      </CardContent>
    </Card>
  );
};
