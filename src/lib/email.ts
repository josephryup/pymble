import { Resend } from "resend";
import { CONTACT } from "@/lib/constants";

type SendWebsiteEmailParams = {
    subject: string;
    replyTo: string;
    html: string;
    text: string;
};

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendWebsiteEmail({ subject, replyTo, html, text }: SendWebsiteEmailParams) {
    if (!resend || !process.env.RESEND_FROM_EMAIL) {
        throw new Error("Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
    }

    const toEmail = process.env.CONTACT_TO_EMAIL || CONTACT.email;

    return resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [toEmail],
        replyTo,
        subject,
        html,
        text,
    });
}

export function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
