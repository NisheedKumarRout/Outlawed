export const USER_ROLES = ["individual", "org", "reviewer", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isAdmin(role: UserRole | null | undefined): role is "admin" {
  return role === "admin";
}
