# Two-factor authentication for Pymble Operations

Two-factor authentication (2FA) is enforced for leadership and finance accounts — the seats that can move money, change roles, or see the entire company's data. Supabase handles the cryptography; this doc covers the operational setup.

## Who must enrol

Required:
- Managing Director
- General Manager
- Owner
- Developer
- Human Resources
- Finance Manager
- Accountant

Recommended (not required):
- Projects Manager
- Engineering Manager
- Procurement Manager
- HSE Officer
- Operations Manager

## What gets used

We use TOTP (time-based one-time password). The user installs an authenticator app on their phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy, etc.), scans the QR code Pymble shows during enrolment, and types the 6-digit code each time they log in.

SMS-based 2FA is not used because Zambian mobile networks have intermittent SMS delivery and the codes can leak through SIM-swap attacks.

## Enabling 2FA at the Supabase project level

This only needs to be done once per Supabase project (dev + production separately).

1. Open the Supabase dashboard → project → **Authentication** → **Providers**
2. Find **Multi-Factor Authentication**
3. Toggle **Enable** under "TOTP"
4. Save

Once enabled, every user can self-enrol from the workspace profile page.

## Enrolling a leadership user

1. The user signs into `/ops` normally
2. Opens `/ops/profile`
3. Clicks **Set up two-factor authentication** (this UI is a future Sprint 13 sub-task; until then, enrolment is done via the Supabase dashboard by an admin)
4. Scans the QR code with their authenticator app
5. Enters the first 6-digit code to confirm the secret was captured
6. Saves the backup recovery codes somewhere safe (a password manager, not a Post-it)

## Logging in after enrolment

1. Email + password as usual on `/ops/login`
2. Supabase prompts for the 6-digit TOTP code
3. The user types it
4. Session is established

If the user loses their authenticator app or phone:
- A second leadership user (MD or Developer) can disable TOTP on the affected account from the Supabase dashboard → Authentication → Users → pick user → **MFA**
- The user re-enrols on their next login
- Recovery codes saved at enrolment time are the user's own fallback

## What happens without 2FA

Today the Supabase project allows password-only login. Until 2FA is enforced at the Supabase level + a Sprint 13 follow-up adds the self-enrolment UI, the policy is **honor system + admin enforcement**:

- The Developer + MD periodically review the Supabase Auth users list and disable any leadership account that hasn't enrolled
- A new leadership invite includes a written reminder to enrol within 7 days of first login

## Operational risk if 2FA isn't on

- A compromised password gives the attacker full access to the role
- For leadership, that means full ZRA / NAPSA / financial visibility, role-change capability, ability to invite new staff
- Supabase logs the IP + user agent of every session; review them in Auth → Users

## Recovery if a leadership 2FA secret is lost

1. Another leadership user (MD or Developer) opens the Supabase dashboard
2. Navigates to **Authentication** → **Users** → finds the user → opens **MFA**
3. Removes the user's TOTP factor
4. The user logs in with password-only on the next attempt and re-enrols immediately
5. The action is recorded automatically in Supabase audit logs

## Future Sprint 13 work item

A self-service enrolment UI inside `/ops/profile` that calls Supabase's `mfa.enroll()` API. Until that lands, enrolment goes through the Supabase dashboard.
