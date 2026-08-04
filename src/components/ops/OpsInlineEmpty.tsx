/**
 * The lightweight sibling of `OpsEmptyState`.
 *
 * `OpsEmptyState` is a full panel — large icon, headline, CTA, min-height —
 * and is right when an entire module section has no records, because that is
 * a moment worth teaching into (see its own header comment).
 *
 * This one is for a list *nested inside* a record that already has context on
 * screen: checklist items within an inspection, lines within a valuation,
 * entries within a site report. There a full panel is too loud — it competes
 * with the record it belongs to and pushes real content below the fold. A
 * single muted line is enough.
 *
 * Pattern was previously re-implemented ad hoc across equipment,
 * delivery-exceptions, daily-site-reports and engineering-controls with
 * slightly different padding and tone each time; this is the shared form.
 */
export function OpsInlineEmpty({
  children,
}: {
  /**
   * One sentence, sentence case, ending in a full stop. Say what is absent
   * and — where it helps — who adds it. "No checklist items added yet."
   * rather than "Empty" or "No data".
   */
  children: React.ReactNode;
}) {
  return (
    <p className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
