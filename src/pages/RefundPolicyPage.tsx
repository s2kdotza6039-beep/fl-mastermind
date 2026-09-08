import { LegalLayout } from "@/components/LegalLayout";

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" updated="September 2026">
      <p>
        Studio Sensei offers a digital subscription service that unlocks access immediately upon
        payment. We keep our refund policy simple and fair.
      </p>

      <h2>1. 7-day money-back guarantee</h2>
      <ul>
        <li>
          If you are unhappy with Studio Sensei Pro for any reason, you may request a full refund
          within <strong>7 days</strong> of your first payment.
        </li>
        <li>This applies to your first subscription charge only.</li>
        <li>Refunds are issued to the original payment method.</li>
      </ul>

      <h2>2. Renewals</h2>
      <ul>
        <li>
          Renewal charges (from your second billing cycle onwards) are generally non-refundable,
          unless we failed to deliver the service you paid for.
        </li>
        <li>
          You can cancel your subscription at any time. Cancellation stops future charges and keeps
          your access active until the end of the current billing period.
        </li>
      </ul>

      <h2>3. How to request a refund</h2>
      <ul>
        <li>
          Contact us through the in-app feedback form, or email the studio admin with the email
          address used for your account and your order details.
        </li>
        <li>
          We aim to confirm every refund request within <strong>3 business days</strong> and process
          approved refunds within <strong>5–10 business days</strong>, depending on your payment
          provider.
        </li>
      </ul>

      <h2>4. What we cannot refund</h2>
      <ul>
        <li>Charges older than 7 days from the first payment.</li>
        <li>Payments for periods where the service was actively used beyond the guarantee window.</li>
        <li>
          Cases of fraud or abuse, including accounts terminated for breaching our Terms &amp;
          Conditions.
        </li>
      </ul>

      <h2>5. Statutory rights</h2>
      <p>
        Nothing in this policy limits any statutory rights you may have under the South African
        Consumer Protection Act (<strong>CPA, Act 68 of 2008</strong>) or the laws of your
        jurisdiction.
      </p>
    </LegalLayout>
  );
}
