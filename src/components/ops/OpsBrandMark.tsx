import Image from "next/image";
import { OPS_BRAND } from "@/lib/ops/constants";

type OpsBrandMarkProps = {
  alt?: string;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
};

export function OpsBrandMark({
  alt = OPS_BRAND.companyName,
  className = "h-12 w-12",
  decorative = false,
  priority = false,
  sizes = "48px",
}: OpsBrandMarkProps) {
  return (
    <Image
      alt={decorative ? "" : alt}
      aria-hidden={decorative}
      className={`shrink-0 object-contain ${className}`}
      height={400}
      priority={priority}
      sizes={sizes}
      src="/ops-logo.svg"
      unoptimized
      width={400}
    />
  );
}
