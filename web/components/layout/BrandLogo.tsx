import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function LegalCompassBrand({
  className,
  href = "/feed",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("legal-compass-brand", className)}
      aria-label="LegalCompass home"
    >
      <Image
        src="/brand/legal-compass-justice.png"
        width={52}
        height={52}
        className="legal-compass-mark"
        alt=""
        priority
      />
      <Image
        src="/brand/legal-compass-wordmark.png"
        width={154}
        height={52}
        className="legal-compass-wordmark"
        alt="LegalCompass"
        priority
      />
    </Link>
  );
}

export function OutlawedIndiaBrand({
  className,
  href = "/dashboard",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("outlawed-india-brand", className)}
      aria-label="OutLawed India administration home"
    >
      <Image
        src="/brand/outlawed-india-admin.png"
        width={180}
        height={95}
        alt="OutLawed India"
        priority
      />
    </Link>
  );
}
