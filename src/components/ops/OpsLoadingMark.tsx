import { OpsBrandMark } from "@/components/ops/OpsBrandMark";

/**
 * The loading affordance: the animated Pymble mark, breathing.
 *
 * `/ops-logo.svg` already animates — the crane string swings on a 4s loop and
 * the file carries its own `prefers-reduced-motion` rule. CSS animations inside
 * an SVG referenced by `<img>` still run, so the mark animates as-is; what it
 * lacked was any signal that the app is *working* rather than just sitting
 * there displaying a logo.
 *
 * So this adds one thing on top: a soft halo that scales and fades. Slow (2s)
 * and low-contrast on purpose — a loading state that pulses urgently makes a
 * fast page feel slow, and this sits behind almost every navigation.
 *
 * Motion is disabled under `motion-reduce`, matching the SVG's own rule, so the
 * whole thing degrades to a static mark rather than half-animating.
 */
export function OpsLoadingMark({
  className = "",
  label = "Loading",
  size = "md",
}: {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dimensions = {
    sm: { box: "size-10", mark: "h-7 w-7" },
    md: { box: "size-16", mark: "h-11 w-11" },
    lg: { box: "size-24", mark: "h-16 w-16" },
    // The full-screen loading state. Large enough that the crane animation in
    // the mark actually reads as motion rather than a shimmer.
    xl: { box: "size-40", mark: "h-28 w-28" },
  }[size];

  return (
    <span
      aria-live="polite"
      className={`relative inline-flex items-center justify-center ${dimensions.box} ${className}`}
      role="status"
    >
      {/* Two halos, offset in time. One alone reads as a pulse; two staggered
          read as something radiating outward, which is the difference between
          "blinking" and "working". `motion-reduce:animate-none` rather than
          hiding them, so the layout does not shift for people who disable
          motion. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-primary/5 motion-safe:animate-ops-breathe-slow motion-reduce:animate-none"
      />
      <span
        aria-hidden="true"
        className="absolute inset-[12%] rounded-full bg-primary/10 motion-safe:animate-ops-breathe motion-reduce:animate-none"
      />
      <OpsBrandMark
        className={`relative ${dimensions.mark}`}
        decorative
        priority
        sizes="160px"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
