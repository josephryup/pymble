import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { COMPANY, CONTACT } from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = {
    title: `Privacy Policy | ${COMPANY.name}`,
    description: `Read the privacy policy for ${COMPANY.name}. Learn how we collect, use, and protect your personal information.`,
};

const LAST_UPDATED = "27 February 2026";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-white">
            {/* Header */}
            <Section className="pt-32 pb-12 md:pt-48 md:pb-16 bg-primary-dark text-white">
                <Container>
                    <span className="label-uppercase text-accent-orange mb-6 block">
                        Legal
                    </span>
                    <h1 className="font-heading text-4xl md:text-6xl font-bold tracking-tighter mb-4">
                        Privacy Policy
                    </h1>
                    <p className="text-white/40 text-sm font-mono">
                        Last updated: {LAST_UPDATED}
                    </p>
                </Container>
            </Section>

            {/* Body */}
            <Section className="py-16 md:py-24">
                <Container>
                    <div className="max-w-3xl mx-auto prose-pymble">
                        <div className="space-y-12 text-primary-dark/70 leading-relaxed">

                            <div className="p-6 bg-neutral-50 border border-black/5 rounded-2xl text-sm">
                                <p>
                                    This Privacy Policy explains how <strong className="text-primary-dark">{COMPANY.legalName}</strong> (&quot;Pymble Construction&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and safeguards information when you visit our website or engage with our services. By using this site, you agree to the practices described below.
                                </p>
                            </div>

                            <PolicySection title="1. Information We Collect">
                                <p>We may collect the following categories of information:</p>
                                <ul>
                                    <li><strong>Contact information</strong> — name, email address, phone number, and company details submitted via our contact or enquiry forms.</li>
                                    <li><strong>Project enquiry details</strong> — descriptions of your construction requirements, timelines, and budget ranges you choose to share with us.</li>
                                    <li><strong>Usage data</strong> — pages visited, time spent on the site, referring URLs, and browser type, collected automatically via cookies and analytics tools.</li>
                                    <li><strong>Communications</strong> — records of emails or messages exchanged with our team.</li>
                                </ul>
                                <p>We do not collect sensitive personal data (such as financial or medical information) through this website.</p>
                            </PolicySection>

                            <PolicySection title="2. How We Use Your Information">
                                <p>We use the information we collect to:</p>
                                <ul>
                                    <li>Respond to enquiries and provide quotations or proposals.</li>
                                    <li>Communicate project updates, timelines, and relevant information.</li>
                                    <li>Improve our website content and user experience.</li>
                                    <li>Send occasional updates or newsletters — only if you have opted in.</li>
                                    <li>Comply with legal obligations applicable under Zambian law.</li>
                                </ul>
                                <p>We will never sell your personal information to third parties.</p>
                            </PolicySection>

                            <PolicySection title="3. Cookies &amp; Analytics">
                                <p>
                                    Our website may use cookies — small text files stored on your device — to improve site functionality and understand how visitors use the site. We may use anonymised analytics tools (such as Google Analytics) to track aggregate usage patterns.
                                </p>
                                <p>
                                    You can disable cookies through your browser settings. Note that doing so may affect certain site features.
                                </p>
                            </PolicySection>

                            <PolicySection title="4. Data Sharing">
                                <p>We only share your information with:</p>
                                <ul>
                                    <li><strong>Service providers</strong> — trusted third parties that help us operate our website or deliver services (e.g., email hosting, analytics), bound by confidentiality agreements.</li>
                                    <li><strong>Legal authorities</strong> — where required by Zambian law, court order, or regulatory obligation.</li>
                                </ul>
                                <p>We do not transfer your data to parties outside Zambia without appropriate safeguards.</p>
                            </PolicySection>

                            <PolicySection title="5. Data Retention">
                                <p>
                                    We retain personal information only for as long as necessary to fulfil the purposes outlined in this policy, or as required by law. Enquiry records are typically retained for up to three (3) years. You may request deletion of your data at any time.
                                </p>
                            </PolicySection>

                            <PolicySection title="6. Your Rights">
                                <p>You have the right to:</p>
                                <ul>
                                    <li>Request access to the personal data we hold about you.</li>
                                    <li>Request correction of inaccurate or incomplete data.</li>
                                    <li>Request deletion of your personal data.</li>
                                    <li>Withdraw consent to receive marketing communications at any time.</li>
                                </ul>
                                <p>
                                    To exercise any of these rights, please contact us at{" "}
                                    <a href={`mailto:${CONTACT.email}`} className="text-accent-orange hover:underline font-medium">
                                        {CONTACT.email}
                                    </a>.
                                </p>
                            </PolicySection>

                            <PolicySection title="7. Security">
                                <p>
                                    We implement reasonable technical and organisational measures to protect your information against unauthorised access, loss, or disclosure. However, no method of electronic transmission is completely secure, and we cannot guarantee absolute security.
                                </p>
                            </PolicySection>

                            <PolicySection title="8. Third-Party Links">
                                <p>
                                    Our website may contain links to external sites. We are not responsible for the privacy practices or content of those sites and encourage you to review their privacy policies independently.
                                </p>
                            </PolicySection>

                            <PolicySection title="9. Changes to This Policy">
                                <p>
                                    We may update this Privacy Policy from time to time. Changes will be posted on this page with a revised &quot;Last updated&quot; date. Continued use of our website after changes constitutes your acceptance of the updated policy.
                                </p>
                            </PolicySection>

                            <PolicySection title="10. Contact Us">
                                <p>For privacy-related queries or concerns, please reach out:</p>
                                <div className="mt-4 p-6 bg-neutral-50 border border-black/5 rounded-2xl space-y-1 text-sm not-prose">
                                    <p className="font-bold text-primary-dark">{COMPANY.legalName}</p>
                                    <p>{CONTACT.address.full}</p>
                                    <p>
                                        <a href={`mailto:${CONTACT.email}`} className="text-accent-orange hover:underline">
                                            {CONTACT.email}
                                        </a>
                                    </p>
                                    <p>
                                        <a href={CONTACT.phoneHref.primary} className="text-accent-orange hover:underline">
                                            {CONTACT.phone.primary}
                                        </a>
                                    </p>
                                </div>
                            </PolicySection>

                        </div>

                        <div className="mt-16 pt-8 border-t border-black/10 flex flex-col sm:flex-row gap-4">
                            <Link
                                href="/terms"
                                className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-accent-orange transition-colors"
                            >
                                View Terms &amp; Conditions →
                            </Link>
                            <Link
                                href="/resources"
                                className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-accent-orange transition-colors"
                            >
                                ← Back to Resources
                            </Link>
                        </div>
                    </div>
                </Container>
            </Section>
        </main>
    );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-4">
            <h2 className="font-heading text-xl md:text-2xl font-bold text-primary-dark tracking-tight border-b border-black/5 pb-3">
                {title}
            </h2>
            <div className="space-y-3 text-[15px] [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-primary-dark">
                {children}
            </div>
        </section>
    );
}
