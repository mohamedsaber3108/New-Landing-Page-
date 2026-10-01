// Shared request validation for the USAM Master backend.
// Zod is already a project dependency and gives us safe parsing + typed output.

import { z } from "zod";
import {
  ENQUIRY_KINDS,
  ENQUIRY_PRODUCTS,
  GUIDE_INTENTS,
} from "@/db/schema";

const localeSchema = z
  .enum(["en", "ar"])
  .default("en")
  .catch("en");

/** Payload accepted by POST /api/enquiries. */
export const createEnquirySchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("a valid email is required")
    .max(320),
  kind: z.enum(ENQUIRY_KINDS).default("general").catch("general"),
  product: z.enum(ENQUIRY_PRODUCTS).nullish(),
  locale: localeSchema,
  message: z
    .string()
    .trim()
    .min(10, "message must be at least 10 characters")
    .max(4000),
});

export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;

/** Payload accepted by POST /api/guide-signals. */
export const createGuideSignalSchema = z.object({
  intent: z.enum(GUIDE_INTENTS),
  locale: localeSchema,
  accepted: z.boolean().default(false).catch(false),
});

export type CreateGuideSignalInput = z.infer<typeof createGuideSignalSchema>;

/**
 * Parse an unknown JSON body against a schema, returning either the typed data
 * or a flat list of human-readable error messages.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
):
  | { success: true; data: z.infer<T> }
  | { success: false; errors: string[] } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { success: false, errors };
}
