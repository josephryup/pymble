import { NextResponse } from "next/server";
import { checkOpsPublicFormRateLimit } from "@/lib/ops/rate-limit";
import { escapeHtml, isEmailConfigured, sendWebsiteEmail } from "@/lib/email";

type QuotePayload = {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    budget?: string;
    service?: string;
    message?: string;
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
    company: 200,
    budget: 120,
    service: 120,
    message: 5000,
};

export async function POST(request: Request) {
    // Unauthenticated endpoint — throttle by IP before doing any work
    // (audit finding S4). Fails open on a database blip.
    const rateLimit = await checkOpsPublicFormRateLimit("quote", request.headers);

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many submissions. Please try again shortly." },
            {
                status: 429,
                headers: { "Retry-After": String(Math.max(rateLimit.retryAfterSeconds, 1)) },
            }
        );
    }

    if (!isEmailConfigured()) {
        return NextResponse.json(
            { error: "Email delivery is not configured on the server." },
            { status: 500 }
        );
    }

    try {
        const body = (await request.json()) as QuotePayload;
        const name = getRequiredString(body.name);
        const email = getRequiredString(body.email);
        const phone = getRequiredString(body.phone);
        const company = getRequiredString(body.company);
        const budget = getRequiredString(body.budget);
        const service = getRequiredString(body.service);
        const message = getRequiredString(body.message);
        const website = getRequiredString(body.website);

        if (website) {
            return NextResponse.json({ ok: true });
        }

        if (!name || !email || !phone || !service || !message) {
            return NextResponse.json(
                { error: "Name, email, phone, service, and project description are required." },
                { status: 400 }
            );
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address." },
                { status: 400 }
            );
        }

        const overLimit = Object.entries({ name, email, phone, company, budget, service, message }).find(
            ([key, value]) => value.length > (FIELD_LIMITS[key] ?? 1000)
        );
        if (overLimit) {
            return NextResponse.json(
                { error: "One of the fields is too long." },
                { status: 400 }
            );
        }

        const subject = `Quote Request: ${service}`;
        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safePhone = escapeHtml(phone);
        const safeCompany = escapeHtml(company || "-");
        const safeBudget = escapeHtml(budget || "Not provided");
        const safeService = escapeHtml(service);
        const safeMessage = escapeHtml(message);

        await sendWebsiteEmail({
            subject,
            replyTo: email,
            html: `
                <h2>New Quote Request</h2>
                <p><strong>Service:</strong> ${safeService}</p>
                <p><strong>Name:</strong> ${safeName}</p>
                <p><strong>Email:</strong> ${safeEmail}</p>
                <p><strong>Phone:</strong> ${safePhone}</p>
                <p><strong>Company:</strong> ${safeCompany}</p>
                <p><strong>Budget:</strong> ${safeBudget}</p>
                <p><strong>Project Description:</strong></p>
                <p>${safeMessage.replaceAll("\n", "<br />")}</p>
            `,
            text: [
                "New Quote Request",
                `Service: ${service}`,
                `Name: ${name}`,
                `Email: ${email}`,
                `Phone: ${phone}`,
                `Company: ${company || "-"}`,
                `Budget: ${budget || "Not provided"}`,
                "",
                "Project Description:",
                message,
            ].join("\n"),
        });

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json(
            { error: "We could not send your quote request right now. Please try again." },
            { status: 500 }
        );
    }
}
