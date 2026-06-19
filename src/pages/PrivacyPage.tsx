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

      <h2>10. How uploaded audio is used</h2>
      <p>
        Uploaded audio is processed solely to deliver the analysis and coaching features you
        actively use (loudness, dynamics, key, BPM, stereo width, frequency balance, coaching).
        Studio Sensei does not publish, distribute, sell, or use your audio to train external AI
        systems. Ownership remains with you — see the <a href="/ownership">Ownership Policy</a>.
      </p>

      <h2>11. How analysis reports are stored</h2>
      <p>
        Analysis reports are stored against your account in our encrypted database and protected
        by Row-Level Security so only you (and Studio Sensei admins, for support and abuse
        investigations) can read them. Deleting a report removes it from your account.
      </p>

      <h2>12. How profile data is stored</h2>
      <p>
        Profile data (display name, role, studio setup, plugin inventory) is stored in our
        encrypted database, protected by Row-Level Security and accessible only to you and
        Studio Sensei admins where strictly necessary for support.
      </p>

      <h2>13. What we collect — and what we don't</h2>
      <p>We collect:</p>
      <ul>
        <li>Account: email, display name, hashed password.</li>
        <li>Uploaded audio you choose to analyze, plus the resulting analysis report.</li>
        <li>Usage events used to keep the product working and detect abuse.</li>
      </ul>
      <p>We do <strong>not</strong> collect:</p>
      <ul>
        <li>Payment-card numbers directly (handled by payment provider when applicable).</li>
        <li>Contact lists, microphone outside of uploads, location, or device identifiers.</li>
        <li>Browsing activity outside Studio Sensei.</li>
      </ul>

      <h2>14. Data retention</h2>
      <p>
        Account data is kept while your account is active. Uploaded audio and analysis reports
        are kept until you delete them or close your account. Security/audit logs are kept for
        up to 12 months.
      </p>

      <h2>15. Account deletion</h2>
      <p>
        You may request deletion of your account at any time from within the app or by
        contacting the admin team. Deletion removes your profile, uploaded audio references,
        analysis reports, track sessions, and feedback. Some security/audit logs may be retained
        for the period above to comply with legal obligations.
      </p>

      <h2>16. Beta testing disclaimer</h2>
      <p>
        Studio Sensei is currently in beta. Features may change, and occasional issues are
        expected. Please avoid uploading your only copy of irreplaceable audio. Use the in-app
        <a href="/feedback"> Feedback</a> page to report problems.
      </p>
    </LegalLayout>
  );
}
