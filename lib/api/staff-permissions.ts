// Fixed permission list for the admin API (L-A1a), from ADMIN.md s.2-3.
// Day-one roles only (Q18): super_admin, admin, lead_inbox_agent.
// There is no permission editor: changing access means changing this file in a
// reviewed PR. The x-admin-token break-glass path keeps full access.

import type { STAFF_ROLES } from "@/db/schema";

export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  "leads:view",
  "leads:assign",
  "leads:update-status",
  "privacy_requests:view",
  "privacy_requests:assign",
  "privacy_requests:answer",
  "privacy_requests:close",
  "consent:view",
  "outbox:view",
  "outbox:retry",
  "policies:view",
  "policies:edit-draft",
  "policies:publish",
  // L-A2: read the admin audit log (Super Admin and Admin).
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  // Owner level: everything in the list.
  super_admin: PERMISSIONS,
  // ADMIN.md s.2: Lead Inbox, Privacy Requests, Consent view, Outbox, policies
  // except publishing ("publish Terms alone" is not allowed for Admin).
  admin: [
    "leads:view",
    "leads:assign",
    "leads:update-status",
    "privacy_requests:view",
    "privacy_requests:assign",
    "privacy_requests:answer",
    "privacy_requests:close",
    "consent:view",
    "outbox:view",
    "outbox:retry",
    "policies:view",
    "policies:edit-draft",
    "audit:view",
  ],
  // ADMIN.md s.2: view, assign, change status of leads. Nothing else.
  lead_inbox_agent: ["leads:view", "leads:assign", "leads:update-status"],
};

/** L-A1b (ADMIN.md s.6): these roles must use MFA; until set up they may only enrol. */
export const MFA_REQUIRED_ROLES: readonly StaffRole[] = ["super_admin", "admin"];

export function mfaRequired(role: string): boolean {
  return (MFA_REQUIRED_ROLES as readonly string[]).includes(role);
}

/**
 * Sensitive actions (ADMIN.md s.5) need an MFA check in this session within
 * STEP_UP_MS, enforced in authorizeAdmin(). Today only policy publish exists;
 * add exports, role changes and key/flag changes here when their routes land.
 */
export const STEP_UP_PERMISSIONS: readonly Permission[] = ["policies:publish"];
export const STEP_UP_MS = 5 * 60_000;

export function roleHas(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS as Record<string, readonly Permission[] | undefined>)[role]?.includes(permission) ?? false;
}

/**
 * The permission each existing admin route needs. Routes pass it to
 * authorizeAdmin(); test/staff-auth.test.ts checks every role against this map.
 */
export const ROUTE_PERMISSIONS = {
  "GET /api/v1/admin/leads": "leads:view",
  "GET /api/v1/admin/privacy-requests": "privacy_requests:view",
  "PATCH /api/v1/admin/privacy-requests": "privacy_requests:answer",
  "GET /api/v1/admin/consent": "consent:view",
  "POST /api/v1/admin/outbox/process": "outbox:retry",
  "GET /api/v1/admin/policies": "policies:view",
  "POST /api/v1/admin/policies": "policies:publish",
  "GET /api/v1/admin/audit": "audit:view",
} as const satisfies Record<string, Permission>;
