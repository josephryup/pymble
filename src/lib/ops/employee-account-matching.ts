/**
 * Suggesting which login account belongs to which employee (audit §2).
 *
 * The employee↔user link is set once on the create form and then rendered as a
 * hidden input on the edit form, so it has never been maintainable. Six of the
 * fourteen employee records carry no `user_id` at all, which is also why those
 * people cannot see their own payslip (§5) — the payslip gate reads exactly
 * this column.
 *
 * This module proposes matches. It deliberately does NOT apply them:
 * `employees.user_id` decides whose payslip a person can open, so an automatic
 * link that gets one wrong exposes someone's pay to a colleague. A confident
 * suggestion a human confirms is the correct level of automation here — the
 * cost of a wrong suggestion is a moment's attention, the cost of a wrong
 * auto-link is a privacy breach.
 *
 * Pure and dependency-free so the matching rules are testable without a
 * database, consistent with the rest of the codebase.
 */

export type EmployeeForMatching = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string | null;
  userId: string | null;
};

export type UserForMatching = {
  id: string;
  fullName: string | null;
  email: string | null;
  isActive: boolean;
};

export type AccountMatchConfidence = "exact_email" | "exact_name" | "likely_name";

export type AccountMatchSuggestion = {
  employeeId: string;
  userId: string;
  confidence: AccountMatchConfidence;
  /** Shown to the person confirming, so the basis is never a mystery. */
  rationale: string;
};

/** Lowercase, strip punctuation and honorifics, collapse whitespace. */
export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|eng|prof)\.?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Sorted name tokens, so "Joseph Phiri" and "Phiri Joseph" agree. */
function nameTokenKey(value: string | null | undefined): string {
  const tokens = normalizePersonName(value).split(" ").filter(Boolean);
  return tokens.slice().sort().join(" ");
}

/**
 * First name + last name only, ignoring middle names. Catches "Joseph Mwansa
 * Phiri" against "Joseph Phiri" — common when HR records the full legal name
 * and the account was created with the everyday one.
 */
function firstLastKey(value: string | null | undefined): string {
  const tokens = normalizePersonName(value).split(" ").filter(Boolean);
  if (tokens.length < 2) return "";
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

/**
 * Propose links for employees that have none.
 *
 * Rules, strongest first. A user already linked to another employee is never
 * suggested, and an employee already linked is skipped entirely — this only
 * ever fills gaps, it never re-points an existing link.
 *
 * Ambiguity loses: if two users match an employee equally well, no suggestion
 * is made for that employee. Two people who share a name is precisely the case
 * where guessing causes the privacy breach, so it is referred to a human
 * rather than resolved by tie-break.
 */
export function suggestEmployeeAccountMatches(input: {
  employees: EmployeeForMatching[];
  users: UserForMatching[];
}): AccountMatchSuggestion[] {
  const takenUserIds = new Set(
    input.employees
      .map((employee) => employee.userId)
      .filter((id): id is string => Boolean(id)),
  );

  const candidates = input.users.filter(
    (user) => user.isActive && !takenUserIds.has(user.id),
  );

  const suggestions: AccountMatchSuggestion[] = [];
  // A user must not be proposed for two different employees in one pass.
  const proposedUserIds = new Set<string>();

  for (const employee of input.employees) {
    if (employee.userId) continue;

    const employeeEmail = normalizeEmail(employee.email);
    const employeeTokens = nameTokenKey(employee.fullName);
    const employeeFirstLast = firstLastKey(employee.fullName);

    const available = candidates.filter((user) => !proposedUserIds.has(user.id));

    const byEmail = employeeEmail
      ? available.filter((user) => normalizeEmail(user.email) === employeeEmail)
      : [];
    const byName = employeeTokens
      ? available.filter((user) => nameTokenKey(user.fullName) === employeeTokens)
      : [];
    const byFirstLast = employeeFirstLast
      ? available.filter((user) => firstLastKey(user.fullName) === employeeFirstLast)
      : [];

    let match: UserForMatching | null = null;
    let confidence: AccountMatchConfidence | null = null;
    let rationale = "";

    if (byEmail.length === 1) {
      match = byEmail[0];
      confidence = "exact_email";
      rationale = `Email matches exactly (${employeeEmail}).`;
    } else if (byName.length === 1) {
      match = byName[0];
      confidence = "exact_name";
      rationale = `Name matches exactly (${employee.fullName} / ${match.fullName ?? ""}).`;
    } else if (byFirstLast.length === 1) {
      match = byFirstLast[0];
      confidence = "likely_name";
      rationale = `First and last name match, ignoring middle names (${employee.fullName} / ${match.fullName ?? ""}).`;
    }

    if (match && confidence) {
      proposedUserIds.add(match.id);
      suggestions.push({
        employeeId: employee.id,
        userId: match.id,
        confidence,
        rationale,
      });
    }
  }

  return suggestions;
}

export type AccountLinkCoverage = {
  totalEmployees: number;
  linked: number;
  unlinked: number;
  /** Active accounts that no employee record points at. */
  usersWithoutEmployee: number;
  coveragePercent: number;
};

/**
 * Both directions of the gap, because they are different problems: an employee
 * with no account cannot see their payslip; an account with no employee record
 * is someone the HR module cannot see at all.
 */
export function summariseAccountLinkCoverage(input: {
  employees: EmployeeForMatching[];
  users: UserForMatching[];
}): AccountLinkCoverage {
  const linkedUserIds = new Set(
    input.employees
      .map((employee) => employee.userId)
      .filter((id): id is string => Boolean(id)),
  );

  const linked = input.employees.filter((employee) => employee.userId).length;
  const totalEmployees = input.employees.length;

  return {
    totalEmployees,
    linked,
    unlinked: totalEmployees - linked,
    usersWithoutEmployee: input.users.filter(
      (user) => user.isActive && !linkedUserIds.has(user.id),
    ).length,
    coveragePercent:
      totalEmployees === 0 ? 0 : Math.round((linked / totalEmployees) * 100),
  };
}
