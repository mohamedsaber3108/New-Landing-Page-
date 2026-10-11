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

  it("accepts a valid structured enterprise block", () => {
    const parsed = createLeadSchema.safeParse({
      ...valid,
      structured: { enquiryType: "hiring", participantRange: "11-50", timeline: "3-6-months", budgetRange: "10k-50k", privacyAcknowledged: true },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown enquiryType in the structured block", () => {
    const parsed = createLeadSchema.safeParse({ ...valid, structured: { enquiryType: "bribe" } });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown timeline/budget enum", () => {
    expect(createLeadSchema.safeParse({ ...valid, structured: { timeline: "someday" } }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, structured: { budgetRange: "trillions" } }).success).toBe(false);
  });

  it("rejects unknown keys in the structured block (strict)", () => {
    const parsed = createLeadSchema.safeParse({ ...valid, structured: { secretField: "x" } });
    expect(parsed.success).toBe(false);
  });

  it("still accepts a lead with no structured block (Contact form)", () => {
    const { ...noStruct } = valid;
    const parsed = createLeadSchema.safeParse(noStruct);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.structured).toBeUndefined();
  });
});
