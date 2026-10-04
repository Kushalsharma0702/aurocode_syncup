import { Link, useParams } from "react-router-dom";

const RETENTION_DAYS = 180;

/**
 * Privacy policy and terms.
 *
 * Deliberately specific about screenshots: the widget rasterises pages on a
 * client's own site, which can incidentally capture personal data belonging to
 * *their* customers. Saying plainly what is captured, what is masked, and how
 * long it is kept is both the honest thing and what India's DPDP Act expects of
 * anyone handling that data.
 */
export default function Legal() {
  const { doc } = useParams<{ doc: string }>();
  const isTerms = doc === "terms";

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="text-sm font-medium text-brand hover:underline">
          ← Back to SyncUp
        </Link>

        {isTerms ? <Terms /> : <Privacy />}

        <p className="mt-10 border-t border-line pt-4 text-xs text-ink4">
          {isTerms ? (
            <Link to="/legal/privacy" className="text-brand hover:underline">
              Privacy policy
            </Link>
          ) : (
            <Link to="/legal/terms" className="text-brand hover:underline">
              Terms of service
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink2">{children}</div>
    </section>
  );
}

function Privacy() {
  return (
    <article className="mt-6">
      <h1 className="text-2xl font-semibold text-ink">Privacy policy</h1>
      <p className="mt-2 text-sm text-ink3">
        How Aurocode SyncUp handles personal data. Last updated 5 October 2026.
      </p>

      <Section title="What we store">
        <p>
          <strong>Account details</strong> — name, username, and the email address and phone number you give
          us, so we can tell you when something happens on your project.
        </p>
        <p>
          <strong>Project content</strong> — proposals, tasks, comments, files you upload, and a timeline of
          actions taken in the app.
        </p>
        <p>
          <strong>Feedback from the widget</strong> — your message, the page address you were on, where on the
          page you clicked, your browser's user-agent string, and a screenshot of that page.
        </p>
        <p>
          <strong>Sign-in records</strong> — the device description and IP address of each active session, so
          you can see and revoke your own logins.
        </p>
      </Section>

      <Section title="Screenshots, specifically">
        <p>
          The feedback widget takes a picture of the page you are looking at. Before that picture is taken,
          anything typed into a form field on the page is replaced with dots, and any element the site marks as
          sensitive is blurred.
        </p>
        <p>
          Masking is not a guarantee. A page can display personal information outside a form field — an order,
          an address, a customer record — and that would be captured. Do not use the widget on pages showing
          other people's personal data, and tell us if a screenshot captures something it should not have. We
          will delete it.
        </p>
        <p>
          Screenshots are stored on our own server, never shared with third parties, and deleted{" "}
          {RETENTION_DAYS} days after the feedback item is closed.
        </p>
      </Section>

      <Section title="How long we keep things">
        <p>Project data is kept while the project is active and for 12 months afterwards.</p>
        <p>Screenshots: {RETENTION_DAYS} days after the related feedback is closed.</p>
        <p>Sign-in session records: 90 days.</p>
        <p>Widget usage counts (how many people opened it, how many sent something): 24 months. These
          contain no names, IP addresses or browser details.</p>
      </Section>

      <Section title="Who else sees it">
        <p>
          Nobody. We do not sell data, do not run advertising, and do not use third-party analytics. Email is
          delivered through our mail provider, which necessarily sees the address and contents of the messages
          we send you.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask for a copy of everything we hold about you, ask us to correct it, or ask us to delete it.
          Write to the address below and we will respond within 30 days.
        </p>
        <p>
          Access links we send you can be revoked at any time — ask, and the old link stops working
          immediately.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Aurocode — Udyam-registered MSME, UDYAM-UP-28-0196515.
          <br />
          Email: <a className="text-brand hover:underline" href="mailto:hello@aurocode.in">hello@aurocode.in</a>
        </p>
      </Section>
    </article>
  );
}

function Terms() {
  return (
    <article className="mt-6">
      <h1 className="text-2xl font-semibold text-ink">Terms of service</h1>
      <p className="mt-2 text-sm text-ink3">Last updated 5 October 2026.</p>

      <Section title="What this is">
        <p>
          SyncUp is a portal where Aurocode shares project proposals, tracks work, and collects feedback from
          clients. Access is granted by Aurocode; there is no public sign-up.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your password and any access link we send you to yourself. An access link signs in whoever opens
          it, so treat it like a password. Tell us promptly if one is forwarded by mistake and we will revoke
          it.
        </p>
      </Section>

      <Section title="Using the feedback widget">
        <p>
          If you install the widget on a website, you confirm you are entitled to do so and that you have told
          the people using that site that screenshots may be captured when they submit feedback.
        </p>
        <p>
          Do not install it on pages that display other people's personal, financial or health information.
        </p>
      </Section>

      <Section title="Content you upload">
        <p>
          You keep ownership of everything you upload. You grant us permission to store and display it for the
          purpose of running the project. We will not use it for anything else.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          We aim to keep SyncUp available but do not promise uninterrupted service. We take daily backups. You
          remain responsible for keeping your own copies of anything you could not afford to lose.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          Either side can end access at any time. On request we will export your project data and then delete
          it.
        </p>
      </Section>

      <Section title="Governing law">
        <p>These terms are governed by the laws of India, with courts in Uttar Pradesh having jurisdiction.</p>
      </Section>
    </article>
  );
}
