# Pymble Website

Next.js marketing site for Pymble Construction.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run optimize:images
```

## Environment Variables

Copy `.env.example` to `.env.local` for local development and set the same values in Vercel for production.

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=
CONTACT_TO_EMAIL=

NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

Notes:

- `RESEND_FROM_EMAIL` should use a verified Resend sender, for example `Pymble Construction <website@pymbleconstruction.com>`.
- `CONTACT_TO_EMAIL` is the inbox that should receive website enquiries.
- `NEXT_PUBLIC_SENTRY_DSN` powers browser-side error tracking.
- `SENTRY_DSN` can match `NEXT_PUBLIC_SENTRY_DSN` if you want one DSN for both browser and server.

## Image Workflow

All new images should be added under `public/` first, then optimized before committing.

Recommended process:

1. Add the original image to the correct folder in `public/images`, `public/video`, or `public/logos`.
2. Use sensible filenames like `01-front.jpg` or `team-lead.jpg`.
3. Run `npm run optimize:images`.
4. Check the page locally with `npm run dev`.
5. Commit the optimized file, not the oversized original.

What the optimizer does:

- Compresses `.jpg`, `.jpeg`, and `.png` files in place.
- Resizes oversized images down to practical web widths.
- Preserves file paths so existing code references keep working.

## Project Galleries

Project gallery items live in `src/lib/project-data.ts`.

Each gallery entry supports:

```ts
{
  src: "/images/projects/project-slug/01-front.jpg",
  alt: "Descriptive alt text",
  caption: "Optional supporting caption"
}
```

## Deployment

This project is ready to deploy on Vercel with:

1. Push the repository to GitHub.
2. Import the repo into Vercel.
3. Keep the default Next.js build settings.
4. Deploy.

## Production Checklist

1. Add all environment variables in Vercel.
2. Verify your Resend domain and sender email.
3. Deploy to Vercel.
4. Submit the contact form and confirm the email arrives in `CONTACT_TO_EMAIL`.
5. Submit the quote modal and confirm the email arrives in `CONTACT_TO_EMAIL`.
6. Enable Sentry in the Vercel project and confirm a test error is captured.
7. Check Vercel Analytics and Speed Insights after the first production traffic arrives.
8. Run PageSpeed Insights against the live homepage and one project detail page.
