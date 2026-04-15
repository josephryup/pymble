# Pymble Construction Website

Marketing and portfolio website for Pymble Construction, built with Next.js and deployed on Vercel.

## Overview

This website showcases Pymble Construction's services, completed projects, company profile, enquiry channels, and resource content.

Key features:

- Responsive marketing website built with Next.js App Router
- Project portfolio with per-project galleries
- Contact and quote forms powered by Resend
- SEO foundations including metadata, sitemap, robots, schema, and `llms.txt`
- Image optimization workflow for future uploads
- Vercel-ready deployment setup

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- Resend
- Vercel Analytics
- Vercel Speed Insights

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
npm run optimize:images
```

## Environment Variables

Copy `.env.example` to `.env.local` and add the required values.

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

- `RESEND_FROM_EMAIL` must use a verified Resend sender, for example `Pymble Construction <website@pymbleconstruction.com>`.
- `CONTACT_TO_EMAIL` is the inbox that receives website enquiries.
- Sentry variables are optional unless monitoring is being enabled.

## Forms

The site includes two production form endpoints:

- `POST /api/contact`
- `POST /api/quote`

These routes send enquiry emails through Resend.

Before going live:

1. Verify the sending domain in Resend.
2. Add the environment variables in Vercel.
3. Test both the contact form and quote form on the deployed site.

## Project Content

Project data is managed in `src/lib/project-data.ts`.

Each project can include:

- Hero image or video
- Structured gallery items
- Service tags
- Project year, location, and description

Gallery item shape:

```ts
{
  src: "/images/projects/project-slug/01-front.jpg",
  alt: "Descriptive alt text",
  caption: "Optional supporting caption"
}
```

## Image Workflow

All new images should be optimized before commit.

Recommended workflow:

1. Add the source image to the correct folder under `public/images` or `public/logos`.
2. Use clean lowercase file names with hyphens.
3. Run:

```bash
npm run optimize:images
```

4. Review the page locally.
5. Commit the optimized result.

The optimizer:

- Compresses `.jpg`, `.jpeg`, and `.png` files in place
- Resizes oversized images to practical web widths
- Preserves existing file paths

## SEO

The site includes:

- Page metadata
- Open Graph and Twitter metadata
- XML sitemap
- `robots.txt`
- `llms.txt`
- Organization and project schema

Important generated routes:

- `/sitemap.xml`
- `/robots.txt`
- `/llms.txt`

## Deployment

This project is configured for Vercel deployment.

Deploy steps:

1. Push the repository to GitHub
2. Import the repository into Vercel
3. Add the required environment variables
4. Deploy

## Production Checklist

- Confirm all Resend environment variables are set in Vercel
- Test contact form delivery
- Test quote form delivery
- Verify `robots.txt`, `sitemap.xml`, and `llms.txt`
- Check the main pages on mobile and desktop
- Confirm project galleries and images load correctly

## Repository Structure

- `public/` for static assets
- `src/app/` for routes and pages
- `src/components/` for shared UI and sections
- `src/components/seo/` for SEO helpers
- `src/lib/` for shared content and constants
