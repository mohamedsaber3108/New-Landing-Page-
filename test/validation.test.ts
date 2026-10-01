import { describe, expect, it } from "vitest";
import { createLeadSchema, flattenFieldErrors } from "@/lib/api/leads";

const valid = {
  name: "Example Person",
  email: "Person@Example.ORG",
  kind: "enterprise",
  product: "education",
  organization: "Example Org",
  locale: "en",
  message: "We would like to discuss a workforce learning programme.",
  marketingOptIn: false,
};

describe("createLeadSchema", () => {
  it("accepts a well-formed lead and normalizes email to lowercase", () => {
    const parsed = createLeadSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("person@example.org");
      expect(parsed.data.kind).toBe("enterprise");
    }
  });

  it("rejects a short message and a missing name with field errors", () => {
    const parsed = createLeadSchema.safeParse({ ...valid, name: "", message: "too short" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fe = flattenFieldErrors(parsed.error);
      expect(Object.keys(fe)).toContain("name");
      expect(Object.keys(fe)).toContain("message");
    }
  });

  it("rejects an invalid email", () => {
    const parsed = createLeadSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(parsed.success).toBe(false);
  });

  it("falls back to safe defaults for unknown kind/locale", () => {
    const parsed = createLeadSchema.safeParse({ ...valid, kind: "bogus", locale: "fr" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe("general");
      expect(parsed.data.locale).toBe("en");
    }
  });

  it("defaults marketingOptIn to false when omitted", () => {
    const { marketingOptIn, ...rest } = valid;
    void marketingOptIn;
    const parsed = createLeadSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.marketingOptIn).toBe(false);
  });
});
