import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCurrentRole } from "@/lib/data/auth";

export default async function MainLayout({ children }: Readonly<{ children: ReactNode }>) {
  const role = await getCurrentRole();

  return (
    <div className="app-frame">
      {process.env.PORTAL_MODE === "admin" ? <AdminSidebar /> : <Sidebar role={role} />}
      <main className="main-canvas">{children}</main>
    </div>
  );
}
