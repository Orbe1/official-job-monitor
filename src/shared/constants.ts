import type { ApplicationStage, JobAudience, TechnicalCategory, WorkArrangement } from "./domain";

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  online_assessment: "Online Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const AUDIENCE_LABELS: Record<JobAudience, string> = {
  internship: "Internship",
  new_grad: "New grad",
  ambiguous: "Needs review",
};

export const CATEGORY_LABELS: Record<TechnicalCategory, string> = {
  software: "Software engineering",
  backend: "Backend",
  frontend: "Frontend",
  full_stack: "Full stack",
  infrastructure: "Infrastructure",
  support: "Support / infrastructure",
  networking: "Networking",
  security: "Security",
  machine_learning: "ML / AI",
  data_science: "Data science",
  data: "Data engineering",
  product_management: "Product management",
  quant: "Quant development",
  embedded: "Embedded systems",
  robotics: "Robotics / autonomy",
};

export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  unspecified: "Not specified",
};

export const CURATED_GROUP_NAMES = [
  "$200k+ New Grad",
  "$300k+ Quant",
  "Top Internships",
  "Big Tech",
  "Quant / Trading",
  "AI / Infra / Research",
  "Fintech",
  "High-Growth Startups",
  "Hardware / Autonomous Systems",
] as const;
