import { NextResponse } from "next/server";
import { escapeHtml, isEmailConfigured, sendWebsiteEmail } from "@/lib/email";

type NewsletterPayload = {
    email?: string;
    website?: string;
};

function getRequiredString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
    if (!isEmailConfigured()) {
        return NextResponse.json(
            { error: "Newsletter delivery is not configured on the server." },
            { status: 500 }
        );
    }

    try {
        const body = (await request.json()) as NewsletterPayload;
        const email = getRequiredString(body.email);
        const website = getRequiredString(body.website);

        if (website) {
            return NextResponse.json({ ok: true });
        }

        if (!email || email.length > 320 || !isValidEmail(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address." },
                { status: 400 }
            );
        }

        const safeEmail = escapeHtml(email);

        await sendWebsiteEmail({
            subject: "Newsletter Signup",
            replyTo: email,
            html: `
                <h2>New Newsletter Signup</h2>
                <p><strong>Email:</strong> ${safeEmail}</p>
            `,
            text: ["New Newsletter Signup", `Email: ${email}`].join("\n"),
        });

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json(
            { error: "We could not add you right now. Please try again." },
            { status: 500 }
        );
    }
}
