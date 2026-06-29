import { NextResponse } from "next/server";
import { escapeHtml, isEmailConfigured, sendWebsiteEmail } from "@/lib/email";

type ContactPayload = {
    name?: string;
    email?: string;
    phone?: string;
    projectType?: string;
    message?: string;
    company?: string;
    website?: string;
};

function getRequiredString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Bound every field so a malicious client can't push a multi-megabyte payload
// into the outbound email. Keep the limits generous for legitimate enquiries.
const FIELD_LIMITS: Record<string, number> = {
    name: 200,
    email: 320,
    phone: 60,
    projectType: 120,
    company: 200,
    message: 5000,
};

export async function POST(request: Request) {
    if (!isEmailConfigured()) {
        return NextResponse.json(
            { error: "Email delivery is not configured on the server." },
            { status: 500 }
        );
    }

    try {
        const body = (await request.json()) as ContactPayload;
        const name = getRequiredString(body.name);
        const email = getRequiredString(body.email);
        const phone = getRequiredString(body.phone);
        const projectType = getRequiredString(body.projectType);
        const company = getRequiredString(body.company);
        const message = getRequiredString(body.message);
        const website = getRequiredString(body.website);

        if (website) {
            return NextResponse.json({ ok: true });
        }

        if (!name || !email || !message) {
            return NextResponse.json(
                { error: "Name, email, and message are required." },
                { status: 400 }
            );
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address." },
                { status: 400 }
            );
        }

        const overLimit = Object.entries({ name, email, phone, projectType, company, message }).find(
            ([key, value]) => value.length > (FIELD_LIMITS[key] ?? 1000)
        );
        if (overLimit) {
            return NextResponse.json(
                { error: "One of the fields is too long." },
                { status: 400 }
            );
        }

        const subject = `Website Inquiry: ${projectType || "General Inquiry"}`;
        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safePhone = escapeHtml(phone || "-");
        const safeProjectType = escapeHtml(projectType || "General Inquiry");
        const safeCompany = escapeHtml(company || "-");
        const safeMessage = escapeHtml(message);

        await sendWebsiteEmail({
            subject,
            replyTo: email,
            html: `
                <h2>New Website Inquiry</h2>
                <p><strong>Name:</strong> ${safeName}</p>
                <p><strong>Email:</strong> ${safeEmail}</p>
                <p><strong>Phone:</strong> ${safePhone}</p>
                <p><strong>Company:</strong> ${safeCompany}</p>
                <p><strong>Project Type:</strong> ${safeProjectType}</p>
                <p><strong>Message:</strong></p>
                <p>${safeMessage.replaceAll("\n", "<br />")}</p>
            `,
            text: [
                "New Website Inquiry",
                `Name: ${name}`,
                `Email: ${email}`,
                `Phone: ${phone || "-"}`,
                `Company: ${company || "-"}`,
                `Project Type: ${projectType || "General Inquiry"}`,
                "",
                "Message:",
                message,
            ].join("\n"),
        });

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json(
            { error: "We could not send your message right now. Please try again." },
            { status: 500 }
        );
    }
}
