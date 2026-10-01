import { describe, expect, it } from "vitest";
import { resolveGuideIntent } from "@/lib/guide-intent";

describe("resolveGuideIntent (local wayfinding behind /api/v1/guide/resolve)", () => {
  it("routes clear learning goals to education", () => {
    expect(resolveGuideIntent("I want to learn data analysis")).toBe("education");
    expect(resolveGuideIntent("أريد أن أتعلم البرمجة")).toBe("education");
  });

  it("routes clear job/career goals to career", () => {
    // Pure career signal (no learning keyword, which would trigger clarify).
    expect(resolveGuideIntent("I need a new job")).toBe("career");
    expect(resolveGuideIntent("أبحث عن وظيفة")).toBe("career");
  });

  it("asks for clarification when career and learning both appear", () => {
    expect(resolveGuideIntent("I need a job and interview practice")).toBe("clarify");
  });

  it("routes freelance/hiring goals to freelancing", () => {
    expect(resolveGuideIntent("I want to hire a freelancer for a project")).toBe("freelancing");
    expect(resolveGuideIntent("أحتاج مستقل لتنفيذ مشروع")).toBe("freelancing");
  });

  it("routes child-related goals to kids", () => {
    expect(resolveGuideIntent("something for my child to learn coding")).toBe("kids");
    expect(resolveGuideIntent("تعليم ابني")).toBe("kids");
  });

  it("asks for clarification when learning and career both appear", () => {
    expect(resolveGuideIntent("I want to learn and then find a job")).toBe("clarify");
  });

  it("returns unknown for an unrelated goal rather than guessing", () => {
    expect(resolveGuideIntent("what is the weather today")).toBe("unknown");
  });
});
