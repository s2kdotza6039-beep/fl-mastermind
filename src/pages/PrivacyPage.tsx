import { LegalLayout } from "@/components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="May 2026">
      <p>
        Studio Sensei respects your privacy and complies with the South African Protection of
        Personal Information Act (<strong>POPIA, Act 4 of 2013</strong>) and applicable international
        data-protection standards.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><strong>Account data:</strong> email, display name, hashed password.</li>
        <li><strong>Usage data:</strong> pages visited, AI requests, feature usage, timestamps.</li>
        <li><strong>Audio uploads:</strong> processed in memory for key detection; not retained on servers unless you save them.</li>
        <li><strong>Technical data:</strong> browser, IP (truncated), user agent — used to detect abuse.</li>
      </ul>

      <h2>2. Why we process it (POPIA lawful basis)</h2>
      <ul>
        <li>To provide the service you requested (contractual necessity).</li>
        <li>To prevent abuse and protect security (legitimate interest).</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. How it is stored</h2>
      <ul>
        <li>Data is stored on encrypted infrastructure (Lovable Cloud / Supabase, AES-256 at rest, TLS 1.2+ in transit).</li>
        <li>Passwords are hashed (bcrypt/argon2) — never stored in plain text.</li>
        <li>Sessions are stored as secure JWTs.</li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>
        We do <strong>not</strong> sell your data. We share only with infrastructure subprocessors
        (Lovable, Supabase, AI gateway) bound by appropriate agreements.
      </p>

      <h2>5. Your rights under POPIA</h2>
      <ul>
        <li>Access — request a copy of your data.</li>
        <li>Correction — fix inaccurate data.</li>
        <li>Deletion — close your account and delete your data.</li>
        <li>Objection — object to certain processing.</li>
        <li>Lodge a complaint with the Information Regulator of South Africa.</li>
      </ul>

      <h2>6. Retention</h2>
      <p>
        Account data is kept while your account is active. Activity logs are kept for up to 12 months
        for security purposes. You may request deletion at any time.
      </p>

      <h2>7. Children</h2>
      <p>The service is not directed at children under 13.</p>

      <h2>8. Cookies</h2>
      <p>
        We use only essential cookies / local storage to keep you signed in and remember your
        checklist progress. No third-party advertising cookies.
      </p>

      <h2>9. Contact</h2>
      <p>
        For data requests, contact the Studio Sensei admin team in-app. Information Regulator:
        inforeg@justice.gov.za
      </p>
    </LegalLayout>
  );
}
