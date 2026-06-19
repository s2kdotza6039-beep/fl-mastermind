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

      <h2>12. Acceptable Use</h2>
      <p>You agree to use Studio Sensei only for lawful music production purposes. You must not:</p>
      <ul>
        <li>Upload audio you do not have the right to upload.</li>
        <li>Upload illegal, harmful, hateful or infringing content.</li>
        <li>Use the service to harass, abuse, defame or threaten any person.</li>
      </ul>

      <h2>13. Abuse Prevention &amp; Fair Usage</h2>
      <p>
        We apply rate limits, anti-abuse checks and reasonable usage caps to keep the service
        fast and fair for everyone. Excessive automated traffic, scraping, or attempts to circumvent
        these limits may be throttled or blocked.
      </p>

      <h2>14. Account Suspension</h2>
      <p>
        We may suspend or terminate accounts that breach these Terms, abuse the service, attempt
        to compromise its security, or pose a risk to other users. Where possible we will give
        notice; in serious cases we may act immediately.
      </p>

      <h2>15. Subscription Rules</h2>
      <p>
        Paid features are available only on an active paid subscription. Subscriptions renew
        according to the terms shown at checkout. Downgrading or cancellation removes access to
        paid features at the end of the current billing period.
      </p>

      <h2>16. Beta Program Terms</h2>
      <p>
        While Studio Sensei is in beta, features may change, be added, or be removed. Beta features
        are provided "as-is" without any guarantee of availability, accuracy, or fitness for any
        particular purpose. You are encouraged to keep backups of important audio and to submit
        bug reports via the in-app feedback page.
      </p>

      <h2>17. Ownership Confirmation</h2>
      <p>
        You retain 100% ownership of all music, beats, stems and projects you upload. Studio Sensei
        does not claim copyright, publishing or master rights in your content. By uploading audio
        you grant Studio Sensei a limited, revocable, non-exclusive licence to process that audio
        solely to provide the analysis and coaching services to you. See the full
        <a href="/ownership"> Ownership Policy</a>.
      </p>

      <h2>18. Limitation of Warranty &amp; Liability</h2>
      <p>
        The service is provided "as-is" and "as-available" without warranties of any kind, whether
        express or implied, including merchantability, fitness for a particular purpose, and
        non-infringement. To the maximum extent permitted by law, Studio Sensei will not be liable
        for indirect, incidental, special, consequential, or punitive damages, or for any loss of
        revenue, profits, goodwill, or data, arising from your use of the service.
      </p>
    </LegalLayout>
  );
}
