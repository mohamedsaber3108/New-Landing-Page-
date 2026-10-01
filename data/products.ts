export type ProductId = "education" | "career" | "freelancing" | "kids";

export type Product = {
  id: ProductId;
  name: string;
  arabicName: string;
  eyebrow: string;
  title: string;
  description: string;
  domain: string;
  cta: string;
  tone: string;
  agent: string;
  features: string[];
  arabicTitle: string;
  arabicDescription: string;
  arabicCta: string;
  arabicFeatures: string[];
};

export const products: Product[] = [
  {
    id: "education",
    name: "USAM Education",
    arabicName: "يوزم للتعليم",
    eyebrow: "LEARN",
    title: "Learn by doing.",
    description: "Practical courses, AI feedback, simulations, and learning paths built around real progress.",
    domain: "https://edu.usamif.com",
    cta: "Explore Education",
    tone: "mint",
    agent: "Masar",
    features: ["Courses", "Practice", "Simulations", "Learning paths", "Certificates"],
    arabicTitle: "تعلّم بالممارسة.",
    arabicDescription: "دورات عملية، وتغذية راجعة بالذكاء الاصطناعي، ومحاكاة، ومسارات تعلم مبنية حول تقدّم حقيقي.",
    arabicCta: "استكشف التعليم",
    arabicFeatures: ["الدورات", "الممارسة", "المحاكاة", "مسارات التعلم", "الشهادات"],
  },
  {
    id: "career",
    name: "USAM Career",
    arabicName: "يوزم للمسار المهني",
    eyebrow: "GROW",
    title: "Find opportunities. Become ready for them.",
    description: "Discover opportunities, strengthen your CV, and prepare your skills and interviews with direction.",
    domain: "https://jobs.usamif.com",
    cta: "Explore Career",
    tone: "sky",
    agent: "Rasheed",
    features: ["Jobs", "Career graph", "CV", "Interview practice", "Salary"],
    arabicTitle: "اعثر على الفرص واستعدّ لها.",
    arabicDescription: "اكتشف الفرص، وطوّر سيرتك الذاتية، واستعد بمهاراتك ومقابلاتك بخطوات واضحة.",
    arabicCta: "استكشف المسار المهني",
    arabicFeatures: ["الوظائف", "خريطة الكارير", "السيرة الذاتية", "تدريب المقابلات", "الرواتب"],
  },
  {
    id: "freelancing",
    name: "USAM Freelancing",
    arabicName: "يوزم للعمل الحر",
    eyebrow: "EARN",
    title: "Turn a goal into work that gets done.",
    description: "Find the right talent, service, team, or expert for the outcome you need to reach.",
    domain: "https://freelancing-platform.usamif.com",
    cta: "Explore Freelancing",
    tone: "amber",
    agent: "Dalel",
    features: ["Talent", "Services", "Solutions", "Teams", "Experts"],
    arabicTitle: "حوّل هدفك إلى عمل يُنجَز.",
    arabicDescription: "اعثر على الموهبة أو الخدمة أو الفريق أو الخبير المناسب للنتيجة التي تريد الوصول إليها.",
    arabicCta: "استكشف العمل الحر",
    arabicFeatures: ["المواهب", "الخدمات", "الحلول", "الفرق", "الخبراء"],
  },
  {
    id: "kids",
    name: "USAM Kids",
    arabicName: "يوزم للأطفال",
    eyebrow: "DISCOVER",
    title: "A learning universe for curious young minds.",
    description: "Missions, stories, coding, English, projects, and creative exploration for ages 7–15.",
    domain: "https://kids.usamif.com",
    cta: "Explore Kids",
    tone: "coral",
    agent: "Azouz",
    features: ["Missions", "Coding", "English", "Projects", "Characters"],
    arabicTitle: "عالم تعلّم للعقول الفضولية.",
    arabicDescription: "مهام وقصص وبرمجة وإنجليزية ومشروعات واستكشاف إبداعي للأعمار من 7 إلى 15 سنة.",
    arabicCta: "استكشف الأطفال",
    arabicFeatures: ["المهام", "البرمجة", "الإنجليزية", "المشروعات", "الشخصيات"],
  },
];

export const trustedDomain = (url: string) => {
  const allowed = products.map((product) => new URL(product.domain).hostname);
  try {
    return allowed.includes(new URL(url).hostname) ? url : "/";
  } catch {
    return "/";
  }
};

export const routes: Record<string, { title: string; label: string; intro: string }> = {
  about: { title: "An ecosystem built around progress.", label: "ABOUT USAM", intro: "USAM connects learning, career growth, work, and early discovery—without making you guess where to begin." },
  ecosystem: { title: "Four products. One connected ecosystem.", label: "THE ECOSYSTEM", intro: "Each product has a distinct purpose. Together, they create more ways to move forward." },
  explore: { title: "Explore by goal, not by platform.", label: "EXPLORE", intro: "Start with the outcome you want. USAM helps identify the right place to continue." },
  "how-it-works": { title: "Your goal is the starting point.", label: "HOW USAM WORKS", intro: "Tell the guide what you are trying to achieve. It routes you to the right product and the next useful action." },
  "for-individuals": { title: "Your next step starts here.", label: "FOR INDIVIDUALS", intro: "Build skills, prepare your career, find opportunities, and grow through real work." },
  "for-enterprises": { title: "Find people, capability, and progress.", label: "FOR ENTERPRISES", intro: "Explore the relevant USAM path for hiring, talent, projects, or workforce learning." },
  government: { title: "Explore the right USAM pathway for your institution.", label: "FOR GOVERNMENT", intro: "Discover available ecosystem pathways for learning, talent, innovation, and youth-focused programs. Some capabilities depend on a direct partnership scope." },
  "for-talent": { title: "Turn your expertise into momentum.", label: "FOR TALENT", intro: "Build proof of your work, find opportunities, and grow your independent path." },
  kids: { title: "Give curiosity somewhere to go.", label: "KIDS & PARENTS", intro: "A guided learning universe where children can explore, create, code, and build confidence." },
  pricing: { title: "Plans live with the products that use them.", label: "PRICING", intro: "USAM Master helps you reach the relevant product pricing without duplicating product-level plan details." },
  contact: { title: "Start a conversation with USAM.", label: "CONTACT", intro: "For general questions, partnerships, or business needs, tell us what you are looking to achieve." },
  trust: { title: "Built with clear boundaries and care.", label: "TRUST CENTER", intro: "Explore how USAM approaches privacy, responsible AI, product boundaries, and child safety." },
  faq: { title: "Useful answers, without the jargon.", label: "FAQ", intro: "Questions about the ecosystem, products, AI guides, accounts, and where to start." },
  guide: { title: "Tell USAM what you want to achieve.", label: "USAM GUIDE", intro: "The guide is an ecosystem router. It helps you decide where to begin; product-specific guides support the next step." },
  privacy: { title: "Privacy at USAM.", label: "LEGAL", intro: "This page is a navigation point to the applicable product privacy information." },
  terms: { title: "Terms at USAM.", label: "LEGAL", intro: "This page is a navigation point to the applicable product terms and conditions." },
  cookies: { title: "Cookie choices.", label: "LEGAL", intro: "USAM keeps necessary website functions separate from optional analytics choices." },
  status: { title: "Product availability.", label: "STATUS", intro: "Each USAM product maintains its own service and application experience." },
};
