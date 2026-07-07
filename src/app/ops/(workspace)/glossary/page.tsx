import { BookOpen } from "lucide-react";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  OPS_GLOSSARY,
  OPS_GLOSSARY_CATEGORY_LABELS,
  type OpsGlossaryCategory,
  getOpsGlossaryByCategory,
} from "@/lib/ops/glossary";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER: OpsGlossaryCategory[] = [
  "commercial",
  "procurement",
  "finance",
  "engineering",
  "hse",
  "general",
];

export default async function OpsGlossaryPage() {
  await requireOpsUser();
  const grouped = getOpsGlossaryByCategory();

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Plain-English glossary
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Every abbreviation used across Pymble Operations, with its full
              form, a short explanation in plain language, and an example so
              you can explain it to anyone on your team.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {OPS_GLOSSARY.length} terms across {CATEGORY_ORDER.length} areas.
            </p>
          </div>
        </div>
      </header>

      {CATEGORY_ORDER.map((category) => {
        const entries = grouped.get(category) ?? [];
        if (entries.length === 0) return null;
        return (
          <section
            key={category}
            className="rounded-lg border border-slate-200 bg-card shadow-sm"
          >
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {OPS_GLOSSARY_CATEGORY_LABELS[category]}
              </h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.term} className="px-6 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-lg font-semibold text-slate-900">
                      {entry.term}
                    </span>
                    <span className="text-base font-medium text-slate-700">
                      {entry.fullForm}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.plain}</p>
                  {entry.example ? (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500">
                      Example: {entry.example}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
