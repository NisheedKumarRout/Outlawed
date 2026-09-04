import { CircleUserRound } from "lucide-react";

import { SectionShell } from "@/components/layout/SectionShell";
import { Button } from "@/components/ui/Button";

export default function ProfilePage() {
  return (
    <SectionShell
      eyebrow="Account"
      title="Your OTR profile"
      description="Manage your session and organization access."
    >
      <div className="quiet-state">
        <CircleUserRound size={30} />
        <h2>Your member profile</h2>
        <p>Sign out when you need to switch between the admin and organization demo accounts.</p>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </div>
    </SectionShell>
  );
}
