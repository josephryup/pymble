import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { COMPANY, CONTACT } from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = {
    title: `Terms & Conditions | ${COMPANY.name}`,
    description: `Terms and conditions for using the ${COMPANY.name} website and engaging our construction services.`,
};

const LAST_UPDATED = "27 February 2026";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-white">
            {/* Header */}
            <Section className="pt-32 pb-12 md:pt-48 md:pb-16 bg-primary-dark text-white">
                <Container>
                    <span className="label-uppercase text-accent-orange mb-6 block">
                        Legal
                    </span>
                    <h1 className="font-heading text-4xl md:text-6xl font-bold tracking-tighter mb-4">
                        Terms &amp; Conditions
                    </h1>
                    <p className="text-white/40 text-sm font-mono">
                        Last updated: {LAST_UPDATED}
                    </p>
                </Container>
            </Section>

            {/* Body */}
            <Section className="py-16 md:py-24">
                <Container>
                    <div className="max-w-3xl mx-auto">
                        <div className="space-y-12 text-primary-dark/70 leading-relaxed">

                            <div className="p-6 bg-neutral-50 border border-black/5 rounded-2xl text-sm">
                                <p>
                                    Please read these Terms &amp; Conditions carefully before using the website operated by{" "}
                                    <strong className="text-primary-dark">{COMPANY.legalName}</strong>{" "}
                                    (&quot;Pymble Construction&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By accessing or using this site, you agree to be bound by these terms.
                                </p>
                            </div>

                            <TermsSection title="1. Use of This Website">
                                <p>
                                    This website is provided for informational purposes about Pymble Construction&apos;s services, portfolio, and company profile. You agree to use it only for lawful purposes and in a manner that does not infringe the rights of others.
                                </p>
                                <p>You must not:</p>
                                <ul>
                                    <li>Use this site in any way that violates applicable Zambian or international law.</li>
                                    <li>Attempt to gain unauthorised access to any part of the site or its infrastructure.</li>
                                    <li>Transmit unsolicited or harmful communications through any contact form.</li>
                                    <li>Reproduce, duplicate, or redistribute our content without prior written permission.</li>
                                </ul>
                            </TermsSection>

                            <TermsSection title="2. Intellectual Property">
                                <p>
                                    All content on this website — including text, graphics, photography, project imagery, logos, and branding — is the intellectual property of {COMPANY.legalName} or its licensors and is protected under applicable copyright and trademark laws.
                                </p>
                                <p>
                                    You may not reproduce, distribute, modify, or publish any content from this site without our express written consent. For media or press enquiries, contact us at{" "}
                                    <a href={`mailto:${CONTACT.email}`} className="text-accent-orange hover:underline font-medium">
                                        {CONTACT.email}
                                    </a>.
                                </p>
                            </TermsSection>

                            <TermsSection title="3. Service Enquiries &amp; Proposals">
                                <p>
                                    Information submitted through our contact or enquiry forms does not constitute a binding contract. Any engagement with Pymble Construction for construction services is subject to a separate, written contract agreed upon by both parties.
                                </p>
                                <p>
                                    Project quotations, estimates, and proposals provided via this site or by email are indicative only and subject to formal assessment, site visits, and contract negotiation.
                                </p>
                            </TermsSection>

                            <TermsSection title="4. Disclaimer of Warranties">
                                <p>
                                    This website is provided on an &quot;as is&quot; basis. While we strive to keep information accurate and up to date, we make no warranties — express or implied — regarding the completeness, accuracy, or reliability of any content on this site.
                                </p>
                                <p>
                                    We do not warrant that the site will be available uninterrupted, error-free, or free of viruses or other harmful components.
                                </p>
                            </TermsSection>

                            <TermsSection title="5. Limitation of Liability">
                                <p>
                                    To the fullest extent permitted by Zambian law, {COMPANY.legalName} shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of, or inability to use, this website or its content.
                                </p>
                                <p>
                                    This limitation does not affect any liability that cannot be excluded under applicable law.
                                </p>
                            </TermsSection>

                            <TermsSection title="6. Third-Party Links">
                                <p>
                                    This site may contain links to third-party websites. These links are provided for convenience only. We do not endorse or assume responsibility for the content, privacy practices, or accuracy of any external sites.
                                </p>
                            </TermsSection>

                            <TermsSection title="7. Downloadable Materials">
                                <p>
                                    Documents available for download on our Resources page (such as our company brochure and profile) are provided for informational purposes. They remain the property of {COMPANY.legalName} and may not be redistributed or published without permission.
                                </p>
                            </TermsSection>

                            <TermsSection title="8. Privacy">
                                <p>
                                    Your use of this website is also governed by our{" "}
                                    <Link href="/privacy" className="text-accent-orange hover:underline font-medium">
                                        Privacy Policy
                                    </Link>
                                    , which is incorporated into these Terms by reference.
                                </p>
                            </TermsSection>

                            <TermsSection title="9. Governing Law">
                                <p>
                                    These Terms &amp; Conditions are governed by and construed in accordance with the laws of the Republic of Zambia. Any disputes arising from your use of this site shall be subject to the exclusive jurisdiction of the courts of Zambia.
                                </p>
                            </TermsSection>

                            <TermsSection title="10. Changes to These Terms">
                                <p>
                                    We reserve the right to update these Terms at any time. Changes will be reflected on this page with a revised &quot;Last updated&quot; date. Your continued use of the site after any changes constitutes acceptance of the revised terms.
                                </p>
                            </TermsSection>

                            <TermsSection title="11. Contact">
                                <p>For questions about these Terms, please contact:</p>
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
                            </TermsSection>

                        </div>

                        <div className="mt-16 pt-8 border-t border-black/10 flex flex-col sm:flex-row gap-4">
                            <Link
                                href="/privacy"
                                className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-accent-orange transition-colors"
                            >
                                View Privacy Policy →
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

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
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
