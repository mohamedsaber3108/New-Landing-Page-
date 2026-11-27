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
  ],
  // ADMIN.md s.2: view, assign, change status of leads. Nothing else.
  lead_inbox_agent: ["leads:view", "leads:assign", "leads:update-status"],
};

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
} as const satisfies Record<string, Permission>;
