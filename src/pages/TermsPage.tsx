import { LegalLayout } from "@/components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" updated="May 2026">
      <p>
        Welcome to <strong>Studio Sensei</strong> ("we", "us", "our"). By creating an account or
        using this application, you ("the user") agree to these Terms.
      </p>

      <h2>1. Service</h2>
      <p>
        Studio Sensei is an AI-powered FL Studio coaching platform offering tutorials, plug-in
        chains, mixing/mastering guidance and music-theory tools.
      </p>

      <h2>2. Account & Security</h2>
      <ul>
        <li>You are responsible for keeping your password secret.</li>
        <li>You must be 13+ to use the service.</li>
        <li>We may suspend accounts engaged in suspicious activity (scraping, automation, brute force).</li>
      </ul>

      <h2>3. Free vs Paid</h2>
      <p>
        Basic Sensei advice is available to free users. Advanced plug-in chains, full mixing/mastering
        guides, exports and downloads are available only to paid users.
      </p>

      <h2>4. Intellectual Property &amp; Copyright</h2>
      <p>
        All Studio Sensei content — including the AI prompt system, plug-in chain logic, FL Studio
        tutorials, genre rules, advice templates, code, design and brand — is the exclusive property
        of Studio Sensei and protected by international copyright law.
      </p>

      <h2>5. No Copying, No Resale, No Reverse Engineering</h2>
      <ul>
        <li>You may <strong>not</strong> copy, reproduce, redistribute or republish Sensei responses, plug-in chains, presets, or guides.</li>
        <li>You may <strong>not</strong> resell, sublicense or commercially exploit any output of the service.</li>
        <li>You may <strong>not</strong> reverse engineer, decompile, scrape, or attempt to extract the AI prompt, model behaviour or backend logic.</li>
        <li>You may <strong>not</strong> use Studio Sensei outputs to train competing AI systems.</li>
        <li>Personal use inside your own music projects is permitted.</li>
      </ul>

      <h2>6. Watermarked Exports</h2>
      <p>
        Exports (PDF/TXT) include identifying watermarks. Removing or tampering with watermarks is a
        breach of these Terms.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Probe, scan, or test the security of the service.</li>
        <li>Use automated tools to send requests at scale.</li>
        <li>Violate any law (including POPIA in South Africa) using the service.</li>
      </ul>

      <h2>8. Disclaimer</h2>
      <p>
        Sensei advice is provided "as-is" for educational purposes. We make no warranty that any
        production technique will guarantee a hit. Always trust your ears.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may terminate accounts that breach these Terms with no refund. You may close your account
        at any time.
      </p>

      <h2>10. Governing Law</h2>
      <p>These Terms are governed by the laws of the Republic of South Africa.</p>

      <h2>11. Contact</h2>
      <p>For questions, contact the Studio Sensei administrators inside the app.</p>
    </LegalLayout>
  );
}
