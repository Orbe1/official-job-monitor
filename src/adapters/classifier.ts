import type { ClassificationResult, RawPosting } from "./types";

type ClassifiablePosting = Pick<
  RawPosting,
  "title" | "descriptionText" | "employmentType" | "department"
> & Partial<Pick<RawPosting, "responsibilities" | "requirements">>;

const INTERNSHIP_PATTERNS = [
  /\bintern(ship)?\b/i,
  /\bco[ -]?op\b/i,
  /\bsummer (analyst|engineer|developer)\b/i,
  /\bstudent (engineer|researcher|program)\b/i,
];

const NEW_GRAD_PATTERNS = [
  /\bnew (college )?grad(uate)?\b/i,
  /\buniversity grad(uate)?\b/i,
  /\bgraduate (software )?engineer\b/i,
  /\bearly career\b/i,
  /\bemerging talent\b/i,
  /\bentry[ -]level\b/i,
  /\bsoftware engineer (i|1)\b/i,
  /\bassociate (software )?(engineer|developer)\b/i,
];

const POSSIBLE_STUDENT_OR_EARLY_CAREER_PATTERNS = [
  ...INTERNSHIP_PATTERNS,
  ...NEW_GRAD_PATTERNS,
  /\bengineer (?:i|1)\b/i,
  /\bph\.?d\.?\b/i,
  /\b20(?:26|27|28|29)\b/i,
];

// Level words are seniority evidence only when they describe the advertised
// title. Role descriptions commonly mention senior coworkers and mentors.
const EXPERIENCED_TITLE_PATTERNS = [
  /\b(sr\.?|senior|staff|principal|lead|director|head|vp)\b/i,
];

const MANAGER_TITLE_PATTERN = /\bmanager\b/i;

const TECHNICAL_TITLE_PATTERNS = [
  /\bsoftware\b/i,
  /\bengineer(ing)?\b/i,
  /\bdeveloper\b/i,
  /\btechnical support\b|\bsupport engineer\b/i,
  /\bnetwork (strategy|engineering|operations|infrastructure)\b/i,
  /\bmachine learning\b|\bartificial intelligence\b|\bai transformation\b|\bai builder\b/i,
  /\bdata (scientist|engineer|platform|infrastructure)\b/i,
  /\bsecurity\b|\bcyber\b/i,
  /\binfrastructure\b|\bdistributed systems?\b|\bcloud engineering\b|\bdevops\b|\bsre\b|\bsite reliability\b/i,
  /\bembedded\b|\bfirmware\b|\brobotics?\b|\bautonomy\b|\bcompiler\b|\bgpu\b|\bquant\b/i,
];

const TECHNICAL_DEPARTMENT_PATTERNS = [
  /\bengineering\b/i,
  /\bdeveloper platform\b/i,
  /\binfrastructure\b/i,
  /\bsecurity\b/i,
  /\bmachine learning\b|\bai\b/i,
  /\bdata (science|engineering|platform)\b/i,
  /\bresearch and development\b|\br&d\b/i,
];

const HARD_NON_TECH_TITLE_PATTERNS = [
  /\bpublic policy\b/i,
  /\bmarketing\b/i,
  /\bbrand(?:ing)?\b|\bsocial media\b/i,
  /\bbusiness enablement\b|\bbusiness (?:operations|ops)\b/i,
  /\b(?:sales|revenue) (?:project|program|operations?) manager\b/i,
  /\bproduct manager\b|\bproduct management\b/i,
  /\bfinancial analyst\b/i,
  /\baccount executive\b/i,
  /\brecruit(?:er|ing)\b|\bhuman resources\b/i,
];

const SOFT_NON_TECH_IDENTITY_PATTERNS = [
  /\bsales\b/i,
  /\bcustomer success\b/i,
  /\bproject management\b/i,
  /\b(?:business|revenue) operations\b/i,
];

// These patterns are applied only to a bounded role section or structured
// responsibility/requirement fields, never to the company's general boilerplate.
const ROLE_SPECIFIC_TECHNICAL_PATTERNS = [
  /\b(?:write|build|develop|ship|debug|test)\w*\s+(?:code|software|applications?|systems?|models?|apis?)\b/i,
  /\b(?:python|javascript|typescript|java|golang|\bgo\b|rust|c\+\+|c#|bash)\b/i,
  /\b(?:rest )?apis?\b|\bgit\b|\blinux\b/i,
  /\b(?:llms?|large language models?|rag|machine learning|predictive model(?:ing)?|model training|fine[- ]tuning)\b/i,
  /\b(?:ip networking|routing|peering|transit|bgp|dns|ssl|tls|http|data centers?)\b/i,
  /\b(?:cloud|distributed systems?|infrastructure|devops|site reliability|\bsre\b)\b/i,
  /\b(?:security|cybersecurity|vulnerabilit(?:y|ies)|encryption)\b/i,
  /\b(?:database|sql|data pipeline|etl|analytics engineering)\b/i,
];

const ROLE_SECTION_START = /^(?:about (?:the )?role|the role|role overview|what you(?:'|’)?ll do|what you will do|responsibilities|role responsibilities)\s*:?$/i;
const ROLE_SECTION_END = /^(?:what makes .+ special\??|about us|about the company|company overview|equal opportunity|eeo statement)\s*:?$/i;

const ADDITIONAL_ROLE_SECTION_START = /^(?:job description|the impact you will have|what we look for|your qualifications(?: and qualities)?|qualifications|requirements|minimum qualifications|required qualifications)\s*:?$/i;
const QUALIFICATION_SECTION_START = /^(?:what we look for|your qualifications(?: and qualities)?|qualifications|requirements|minimum qualifications|required qualifications)\s*:?$/i;
const ROLE_BOILERPLATE_START = /^(?:pay range transparency|about [a-z0-9& .'-]+|benefits|our commitment to .+|compliance)\s*:?$/i;

const PRODUCT_MANAGEMENT_TITLE = /\b(?:associate\s+)?product manager\b|\bproduct management\b/i;
const TECHNICAL_DEGREE_FIELD = /\b(?:computer science|computer engineering|software engineering|data science|electrical engineering|related engineering (?:field|practice|discipline))\b/i;
const DEGREE_LEVEL = /\b(?:bachelor(?:'s|s)?|master(?:'s|s)?|b\.?s\.?|m\.?s\.?|degree)\b/i;
const NON_TECHNICAL_DEGREE_ALTERNATIVE = /\b(?:business|marketing|finance|economics|communications?|liberal arts|project management)\b/i;
const OPTIONAL_QUALIFICATION = /\b(?:preferred|nice to have|bonus|a plus|helpful)\b/i;
const HANDS_ON_PRODUCT_ACTION = /\b(?:prototype|build|develop|code|implement|test|ship|debug|program)\w*\b/i;
const TECHNICAL_PRODUCT_TOOL = /\b(?:sql|python|javascript|typescript|java|golang|rust|c\+\+|c#|apis?|git|linux|pytorch|machine learning|deep learning|llms?|large language models?)\b/i;
const RESEARCH_SCIENTIST_TITLE = /\bresearch scientist\b/i;
const MACHINE_LEARNING_CONTEXT = /\b(?:gen(?:erative)?[ -]?ai|machine learning|artificial intelligence|deep learning|llms?|large language models?|pytorch|model (?:training|fine[- ]tuning))\b/i;
const PURSUING_PHD = /\b(?:pursu(?:e|ing)\s+(?:an?\s+)?ph\.?d\.?|currently enrolled\s+(?:in|as)[^\n.]{0,50}\bph\.?d\.?|ph\.?d\.? candidate)\b/i;
const NON_PHD_STUDENT_DEGREE = /\b(?:bachelor(?:'s|s)?|master(?:'s|s)?|b\.?s\.?|m\.?s\.?)\b/i;

export function classifyPosting(posting: ClassifiablePosting): ClassificationResult {
  const title = posting.title.trim();
  const department = posting.department?.trim() ?? "";
  const roleIdentity = `${title}\n${posting.employmentType ?? ""}\n${department}`;
  const roleEvidence = roleSpecificEvidence(posting);
  const qualificationText = qualificationEvidence(posting);
  const titleInternship = INTERNSHIP_PATTERNS.some((pattern) => pattern.test(title));
  const titleNewGrad = NEW_GRAD_PATTERNS.some((pattern) => pattern.test(title));
  const technicalProductManagement = isGuardedTechnicalProductManagement(
    title,
    titleInternship || titleNewGrad,
    roleEvidence,
    qualificationText,
  );
  const machineLearningResearchScientist = isMachineLearningResearchScientist(
    title,
    department,
    roleEvidence,
  );
  const technicalIdentity = technicalProductManagement
    || machineLearningResearchScientist
    || hasTechnicalIdentity(title, department);
  const roleTechnicalSignalCount = countMatchingPatterns(roleEvidence.text, ROLE_SPECIFIC_TECHNICAL_PATTERNS);
  const roleOnlyTechnical = !technicalIdentity && roleEvidence.specific && roleTechnicalSignalCount >= 2;
  const category = technicalProductManagement
    ? "product_management"
    : machineLearningResearchScientist
      ? "machine_learning"
      : categoryFor(posting, roleEvidence.text);
  const hardNonTechnical = !technicalProductManagement
    && HARD_NON_TECH_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  const softNonTechnical = SOFT_NON_TECH_IDENTITY_PATTERNS.some((pattern) => pattern.test(`${title}\n${department}`));

  if (hardNonTechnical || (softNonTechnical && !technicalIdentity) || (!technicalIdentity && !roleOnlyTechnical)) {
    return {
      relevant: false,
      audience: "irrelevant",
      technicalCategory: category,
      confidence: 0.92,
      reasons: ["No supported technical-role signal"],
      reviewRequired: false,
    };
  }

  // Audience identity comes only from the role's title, employment type, or
  // department. Descriptions often mention interns and campus programs while
  // advertising an experienced position.
  const internship = INTERNSHIP_PATTERNS.some((pattern) => pattern.test(roleIdentity));
  const newGrad = NEW_GRAD_PATTERNS.some((pattern) => pattern.test(roleIdentity));
  const experienced = EXPERIENCED_TITLE_PATTERNS.some((pattern) => pattern.test(title))
    || (!technicalProductManagement && MANAGER_TITLE_PATTERN.test(title))
    || hasExplicitExperienceRequirement(roleEvidence.text);

  if (experienced) {
    return {
      relevant: false,
      audience: "irrelevant",
      technicalCategory: category,
      confidence: 0.9,
      reasons: ["Experienced-level requirement or title"],
      reviewRequired: false,
    };
  }

  if (internship && hasPhdOnlyStudentRequirement(qualificationText)) {
    return {
      relevant: false,
      audience: "internship",
      technicalCategory: category,
      confidence: 0.88,
      reasons: ["Technical internship is explicitly PhD-only; review against undergraduate scope"],
      reviewRequired: true,
    };
  }

  if (technicalProductManagement && internship) {
    return {
      relevant: true,
      audience: "internship",
      technicalCategory: category,
      confidence: 0.93,
      reasons: [
        "Mandatory technical degree and hands-on technical product evidence",
        "Internship/student terminology in title",
      ],
      reviewRequired: false,
    };
  }

  if (technicalProductManagement && newGrad) {
    return {
      relevant: true,
      audience: "new_grad",
      technicalCategory: category,
      confidence: 0.92,
      reasons: [
        "Mandatory technical degree and hands-on technical product evidence",
        "New-graduate/early-career terminology in title",
      ],
      reviewRequired: false,
    };
  }

  if ((internship || newGrad) && roleOnlyTechnical) {
    return {
      relevant: false,
      audience: "ambiguous",
      technicalCategory: category,
      confidence: 0.76,
      reasons: ["Technical responsibilities with an ambiguous role title or department"],
      reviewRequired: true,
    };
  }

  if (internship) {
    return {
      relevant: true,
      audience: "internship",
      technicalCategory: category,
      confidence: 0.97,
      reasons: ["Technical role identity from title or department", "Internship/student terminology"],
      reviewRequired: false,
    };
  }

  if (newGrad) {
    return {
      relevant: true,
      audience: "new_grad",
      technicalCategory: category,
      confidence: 0.94,
      reasons: ["Technical role identity from title or department", "New-graduate/early-career terminology"],
      reviewRequired: false,
    };
  }

  const lowExperience = /\b(0|one|1)[ -](2|two) years?\b|\b0\s*(?:-|to)\s*2 years?\b|\bno (professional )?experience\b/i.test(roleEvidence.text);
  if (lowExperience) {
    return {
      relevant: false,
      audience: "ambiguous",
      technicalCategory: category,
      confidence: 0.68,
      reasons: ["Low-experience requirement without explicit student audience"],
      reviewRequired: true,
    };
  }

  return {
    relevant: false,
    audience: "irrelevant",
    technicalCategory: category,
    confidence: 0.62,
    reasons: ["Technical role lacks student or early-career evidence"],
    reviewRequired: false,
  };
}

/**
 * Cheap Greenhouse bulk-pass signal. This intentionally uses only identity
 * fields available on the board response and is broader than final product
 * classification. False positives receive one detail check and can then be
 * represented by the compact source ledger; false negatives would prevent a
 * potentially useful role from receiving official detail enrichment.
 */
export function isPossibleStudentOrEarlyCareerPosting(posting: ClassifiablePosting): boolean {
  const roleIdentity = `${posting.title}\n${posting.employmentType ?? ""}\n${posting.department ?? ""}`;
  return POSSIBLE_STUDENT_OR_EARLY_CAREER_PATTERNS.some((pattern) => pattern.test(roleIdentity));
}

function hasTechnicalIdentity(title: string, department: string): boolean {
  return TECHNICAL_TITLE_PATTERNS.some((pattern) => pattern.test(title))
    || TECHNICAL_DEPARTMENT_PATTERNS.some((pattern) => pattern.test(department));
}

function isGuardedTechnicalProductManagement(
  title: string,
  hasExplicitTitleAudience: boolean,
  roleEvidence: { text: string; specific: boolean },
  qualificationText: string,
): boolean {
  if (!PRODUCT_MANAGEMENT_TITLE.test(title) || !hasExplicitTitleAudience || !roleEvidence.specific) {
    return false;
  }
  return hasMandatoryTechnicalDegreeRequirement(qualificationText)
    && HANDS_ON_PRODUCT_ACTION.test(roleEvidence.text)
    && TECHNICAL_PRODUCT_TOOL.test(roleEvidence.text);
}

function hasMandatoryTechnicalDegreeRequirement(qualificationText: string): boolean {
  return qualificationText.split(/\n+/).some((line) => {
    const text = line.trim();
    return text.length > 0
      && !OPTIONAL_QUALIFICATION.test(text)
      && !NON_TECHNICAL_DEGREE_ALTERNATIVE.test(text)
      && !/\bequivalent (?:experience|practical experience)\b/i.test(text)
      && DEGREE_LEVEL.test(text)
      && TECHNICAL_DEGREE_FIELD.test(text);
  });
}

function isMachineLearningResearchScientist(
  title: string,
  department: string,
  roleEvidence: { text: string; specific: boolean },
): boolean {
  if (!RESEARCH_SCIENTIST_TITLE.test(title)) return false;
  return MACHINE_LEARNING_CONTEXT.test(`${title}\n${department}`)
    || (roleEvidence.specific && MACHINE_LEARNING_CONTEXT.test(roleEvidence.text));
}

function hasPhdOnlyStudentRequirement(qualificationText: string): boolean {
  const requiredLines = qualificationText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !OPTIONAL_QUALIFICATION.test(line));
  return requiredLines.some((line) => PURSUING_PHD.test(line))
    && !requiredLines.some((line) => NON_PHD_STUDENT_DEGREE.test(line));
}

function hasExplicitExperienceRequirement(roleEvidence: string): boolean {
  return roleEvidence.split(/\n+/).some((line) => {
    const text = line.trim();
    return /\b(?:minimum(?: of)?|at least|requires?|required|must have|you (?:have|bring))[^\n.]{0,100}\b(?:[3-9]|[1-9]\d)\+?\s+years?\b/i.test(text)
      || /^(?:[-•]\s*)?(?:[3-9]|[1-9]\d)\+?\s+years?\s+(?:of\s+)?(?:professional|relevant|industry|hands-on|software|engineering|technical)?[^\n.]{0,80}\bexperience\b/i.test(text)
      || /\b(?:[3-9]|[1-9]\d)\+?\s+years?\s+of\s+(?:professional|relevant|industry|hands-on|software|engineering|technical)\s+experience\b/i.test(text);
  });
}

function roleSpecificEvidence(posting: ClassifiablePosting): { text: string; specific: boolean } {
  const structured = [...(posting.responsibilities ?? []), ...(posting.requirements ?? [])]
    .map((item) => item.trim())
    .filter(Boolean);
  const lines = posting.descriptionText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => (
    ROLE_SECTION_START.test(line) || ADDITIONAL_ROLE_SECTION_START.test(line)
  ));
  const selected = start >= 0 ? lines.slice(start) : lines;
  const end = selected.findIndex((line, index) => index > 0 && (
    ROLE_SECTION_END.test(line) || ROLE_BOILERPLATE_START.test(line)
  ));
  const bounded = (end >= 0 ? selected.slice(0, end) : selected).join("\n").slice(0, 12_000);

  return {
    text: [...structured, bounded].filter(Boolean).join("\n"),
    specific: structured.length > 0 || start >= 0,
  };
}

function qualificationEvidence(posting: ClassifiablePosting): string {
  const structured = (posting.requirements ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  const lines = posting.descriptionText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => QUALIFICATION_SECTION_START.test(line));
  if (start < 0) return structured.join("\n");
  const selected = lines.slice(start + 1);
  const end = selected.findIndex((line) => (
    ROLE_SECTION_END.test(line) || ROLE_BOILERPLATE_START.test(line)
  ));
  const bounded = (end >= 0 ? selected.slice(0, end) : selected).join("\n").slice(0, 8_000);
  return [...structured, bounded].filter(Boolean).join("\n");
}

function countMatchingPatterns(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
}

function categoryFor(posting: ClassifiablePosting, roleEvidence: string): ClassificationResult["technicalCategory"] {
  const identity = `${posting.title}\n${posting.department ?? ""}`;
  return categoryFromTitle(posting.title) ?? categoryFromIdentity(identity) ?? categoryFromRoleEvidence(roleEvidence);
}

function categoryFromTitle(title: string): ClassificationResult["technicalCategory"] | null {
  if (/\bdata scientists?\b/i.test(title)) return "data_science";
  if (/\bdata engineer(?:s|ing)?\b/i.test(title)) return "data";
  return null;
}

function categoryFromIdentity(identity: string): ClassificationResult["technicalCategory"] | null {
  if (/\btechnical support\b|\bsupport engineer\b|\bcustomer support engineering\b/i.test(identity)) return "support";
  if (/\bnetwork(?:ing)?\b|\binterconnection\b|\bpeering\b|\brouting\b/i.test(identity)) return "networking";
  if (/\b(?:quant(?:itative)? (?:developer|engineer|researcher|trader)|quant developer|trading systems?)\b/i.test(identity)) return "quant";
  if (/\brobot(?:ics?|ic)\b|\bautonomy\b|\bautonomous (?:systems?|vehicles?|robots?)\b/i.test(identity)) return "robotics";
  if (/\bembedded\b|\bfirmware\b|\bhardware engineer\b|\bgpu\b|\bcuda\b|\bcompiler\b/i.test(identity)) return "embedded";
  if (/\bmachine learning\b|\bartificial intelligence\b|\bai\b|\bgen(?:erative)?[ -]?ai\b/i.test(identity)) return "machine_learning";
  if (/\bsecurity\b|\bcyber\b|\bprivacy engineer\b/i.test(identity)) return "security";
  if (/\bdata (?:scientist|engineer|platform|infrastructure)\b|\banalytics engineer\b/i.test(identity)) return "data";
  if (/\binfrastructure\b|\bplatform engineering\b|\bcloud engineering\b|\bdevops\b|\bsite reliability\b|\bsre\b|\bdistributed systems?\b/i.test(identity)) return "infrastructure";
  if (/\bfront[ -]?end\b|\bweb ui\b/i.test(identity)) return "frontend";
  if (/\bfull[ -]?stack\b/i.test(identity)) return "full_stack";
  if (/\bback[ -]?end\b|\bserver engineer\b|\bapi engineer\b/i.test(identity)) return "backend";
  if (/\bsoftware\b|\bengineer(?:ing)?\b|\bdeveloper\b/i.test(identity)) return "software";
  return null;
}

function categoryFromRoleEvidence(text: string): ClassificationResult["technicalCategory"] {
  if (/\btechnical support\b|\btroubleshoot(?:ing)?\b.*\b(?:dns|http|network|linux)\b/i.test(text)) return "support";
  if (/\b(?:ip networking|peering|routing|transit|bgp|interconnection|network capacity)\b/i.test(text)) return "networking";
  if (/\b(?:quant(?:itative)? (?:development|research|trading)|low latency trading)\b/i.test(text)) return "quant";
  if (/\brobot(?:ics?|ic)\b|\bautonomous (?:systems?|vehicles?|robots?)\b|\bmotion planning\b|\bperception systems?\b/i.test(text)) return "robotics";
  if (/\bembedded\b|\bfirmware\b|\bgpu\b|\bcuda\b|\bcompiler\b/i.test(text)) return "embedded";
  if (/\bmachine learning\b|\bartificial intelligence\b|\bllms?\b|\brag\b|\bmodel (?:training|fine[- ]tuning)\b/i.test(text)) return "machine_learning";
  if (/\bsecurity\b|\bcybersecurity\b|\bvulnerabilit(?:y|ies)\b|\bencryption\b/i.test(text)) return "security";
  if (/\bdata engineer\b|\bdata platform\b|\betl\b|\banalytics engineer\b/i.test(text)) return "data";
  if (/\binfrastructure\b|\bdistributed systems?\b|\bcloud platform\b|\bdevops\b|\bsite reliability\b|\bsre\b/i.test(text)) return "infrastructure";
  if (/\bfront[ -]?end\b|\breact\b|\bweb ui\b/i.test(text)) return "frontend";
  if (/\bfull[ -]?stack\b/i.test(text)) return "full_stack";
  if (/\bback[ -]?end\b|\bserver\b|\bapis?\b/i.test(text)) return "backend";
  return "software";
}
