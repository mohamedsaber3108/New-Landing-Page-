export type GuideIntent = "education" | "career" | "freelancing" | "kids" | "clarify" | "unknown";

/** Local wayfinding only. No model call, external request, or implied account transfer. */
export function resolveGuideIntent(input: string): GuideIntent {
  const text = input.toLowerCase().normalize("NFKC").replace(/[أإآ]/g, "ا").replace(/[\u064B-\u065F]/g, "");
  if (/(\b(child|kids?|parents?|son|daughter)\b|طفل|اطفال|ابني|بنتي|اولاد)/.test(text)) return "kids";
  const learn = /(\b(learn|learning|course|study|skill|practice)\b|تعلم|اتعلم|مهار|كورس|دراس|تدريب)/.test(text);
  const career = /(\b(jobs?|career|cv|resume|interview|salary)\b|وظيف|كارير|سيره|مقابل|توظيف)/.test(text);
  const work = /(\b(freelanc\w*|hire|client|contractor)\b|مستقل|عمل حر|فريلانس|عميل|خبير|ينفذ)/.test(text);
  const project = /(\b(project|team)\b|مشروع|فريق)/.test(text);
  if (learn && (career || work)) return "clarify";
  if (work) return "freelancing";
  if (learn) return "education";
  if (career) return "career";
  if (project) return "clarify";
  return "unknown";
}
