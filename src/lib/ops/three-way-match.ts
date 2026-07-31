/**
 * The three-way match: requested → ordered → received (audit D12).
 *
 * The classic procurement control, and the last gap in the commitment chain.
 * Without it, a delivery can quietly differ from the order, and the order from
 * the request, with nothing reconciling the three — which is how over-delivery
 * gets paid for and short delivery goes unnoticed.
 *
 * Pure, so the matching rules are testable without a database, consistent with
 * the rest of the spine work.
 */

export type MatchLine = {
  requestItemId: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  orderedQuantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  orderedValue: number;
  receivedValue: number;
};

export type MatchResult = MatchLine & {
  /** Ordered beyond what was requested. */
  overOrdered: boolean;
  /** Received beyond what was ordered — the one that costs money. */
  overReceived: boolean;
  /** Ordered but not fully delivered. */
  shortDelivered: boolean;
  outstandingQuantity: number;
  /** Nothing to query: requested = ordered = received, nothing rejected. */
  isClean: boolean;
  /** Value at risk on this line — over-receipt is billable by the supplier. */
  exposureValue: number;
};

export type MatchSummary = {
  lines: MatchResult[];
  cleanCount: number;
  exceptionCount: number;
  overReceivedValue: number;
  shortDeliveredQuantity: number;
  /** True when every line reconciles — safe to pay the supplier invoice. */
  readyToPay: boolean;
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safe(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function matchLine(line: MatchLine): MatchResult {
  const requested = safe(line.requestedQuantity);
  const ordered = safe(line.orderedQuantity);
  const received = safe(line.receivedQuantity);
  const rejected = safe(line.rejectedQuantity);

  // Rejected goods came back, so they are not received for matching purposes.
  const accepted = round(received - rejected);
  const overReceived = accepted > ordered;
  const unitValue = ordered > 0 ? safe(line.orderedValue) / ordered : 0;

  return {
    ...line,
    overOrdered: ordered > requested,
    overReceived,
    shortDelivered: accepted < ordered,
    outstandingQuantity: round(Math.max(ordered - accepted, 0)),
    isClean:
      ordered === requested && accepted === ordered && rejected === 0 && ordered > 0,
    // Only over-receipt carries a cost exposure: the supplier can bill for it.
    // Short delivery is a delivery problem, not a money-at-risk problem.
    exposureValue: overReceived ? round((accepted - ordered) * unitValue) : 0,
  };
}

export function summariseMatch(lines: MatchLine[]): MatchSummary {
  const results = lines.map(matchLine);

  const exceptions = results.filter((line) => !line.isClean);

  return {
    lines: results,
    cleanCount: results.length - exceptions.length,
    exceptionCount: exceptions.length,
    overReceivedValue: round(
      results.reduce((sum, line) => sum + line.exposureValue, 0),
    ),
    shortDeliveredQuantity: round(
      results.reduce((sum, line) => sum + (line.shortDelivered ? line.outstandingQuantity : 0), 0),
    ),
    // A supplier invoice should not be paid while any line is over-received:
    // that is the one exception where paying commits real money to something
    // nobody authorised. Short delivery is allowed to pass — you pay for what
    // arrived.
    readyToPay: results.length > 0 && results.every((line) => !line.overReceived),
  };
}
