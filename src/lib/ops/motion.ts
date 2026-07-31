/**
 * The motion scale (audit §12).
 *
 * The design system covers colour, spacing and typography but says nothing
 * about movement, so every screen either improvised or omitted it — two
 * transition tokens across the whole ops UI kit and no reduced-motion handling
 * at all. Motion added per-component drifts exactly the way the colour classes
 * did before the status-tone registry, so it belongs here as a small, fixed
 * vocabulary.
 *
 * Three durations, one easing curve. That is deliberate: a longer list invites
 * arbitrary choices, and the difference between 180ms and 200ms is not a
 * decision worth making twice.
 *
 *   instant  hover, focus, colour — should feel like a state, not an animation
 *   quick    the default: disclosure, toast entry, small position changes
 *   settle   larger surfaces travelling further (panels, sheets)
 *
 * The easing is a standard decelerate curve: quick to start, easing to a stop,
 * so movement feels like it is arriving rather than being pushed.
 *
 * Every token pairs with `motion-reduce:` variants. Someone who has asked their
 * operating system to reduce motion has usually done so because movement makes
 * them unwell — honouring it is not a nicety.
 */

export const OPS_MOTION = {
  instant: "duration-100",
  quick: "duration-200",
  settle: "duration-300",
  ease: "ease-[cubic-bezier(0.2,0,0,1)]",
} as const;

/**
 * Standard transition for interactive surfaces (buttons, rows, cards).
 * Colour and shadow only — never layout, which causes reflow jank.
 */
export const OPS_TRANSITION =
  `transition-[color,background-color,border-color,box-shadow,opacity] ${OPS_MOTION.instant} ${OPS_MOTION.ease} motion-reduce:transition-none`;

/** Entry animation for transient surfaces (toasts, popovers). */
export const OPS_ENTER =
  `animate-in fade-in slide-in-from-bottom-2 ${OPS_MOTION.quick} ${OPS_MOTION.ease} motion-reduce:animate-none`;

/** Exit animation for the same. */
export const OPS_EXIT =
  `animate-out fade-out slide-out-to-bottom-2 ${OPS_MOTION.quick} ${OPS_MOTION.ease} motion-reduce:animate-none`;

/**
 * A pending surface: dimmed and non-interactive while work is in flight.
 * Paired with a spinner rather than used alone — dimming on its own reads as
 * "disabled", not "working".
 */
export const OPS_PENDING = "opacity-60 pointer-events-none";
