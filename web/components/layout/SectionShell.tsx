import type { ReactNode } from "react";

import { Navbar } from "@/components/layout/Navbar";

export function SectionShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="page-grid single-page-grid">
      <section className="content-column">
        <Navbar eyebrow={eyebrow} title={title} description={description} />
        {children}
      </section>
    </div>
  );
}
