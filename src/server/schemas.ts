import { z } from "zod";

const idSchema = z.string().trim().min(1).max(160);
const nullableDateTimeSchema = z.string().datetime({ offset: true }).nullable();

export const routeIdSchema = z.object({ id: idSchema }).strict();
export const companyRouteSchema = z.object({ companyId: idSchema }).strict();
export const jobRouteSchema = z.object({ jobId: idSchema }).strict();

export const followBodySchema = z
  .object({
    followed: z.boolean(),
  })
  .strict();

export const applicationStageSchema = z.enum([
  "saved",
  "applied",
  "online_assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]);

export const userJobStateBodySchema = z
  .object({
    saved: z.boolean().optional(),
    stage: applicationStageSchema.nullable().optional(),
    notes: z.string().max(20_000).optional(),
    appliedAt: nullableDateTimeSchema.optional(),
    nextActionAt: nullableDateTimeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one job-state field is required.",
  });

export const jobAudienceSchema = z.enum(["internship", "new_grad", "ambiguous"]);
export const technicalCategorySchema = z.enum([
  "software",
  "backend",
  "frontend",
  "full_stack",
  "infrastructure",
  "support",
  "networking",
  "security",
  "machine_learning",
  "data_science",
  "data",
  "product_management",
  "quant",
  "embedded",
  "robotics",
]);
export const workArrangementSchema = z.enum(["remote", "hybrid", "onsite", "unspecified"]);

export const userPreferencesBodySchema = z
  .object({
    onboardingCompleted: z.boolean().optional(),
    opportunityFocus: z.enum(["internship", "new_grad", "both"]).optional(),
    technicalInterests: z.array(technicalCategorySchema).max(15).optional(),
    preferredLocations: z.array(z.string().trim().min(1).max(160)).max(25).optional(),
    remotePreferred: z.boolean().optional(),
    defaultNotificationFrequency: z.enum(["immediate", "daily", "off"]).optional(),
    lastVisitAt: nullableDateTimeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one preference field is required.",
  });

export const alertCriteriaSchema = z
  .object({
    audiences: z.array(jobAudienceSchema).max(3).optional(),
    companyIds: z.array(idSchema).max(250).optional(),
    followedCompaniesOnly: z.boolean().optional(),
    technicalCategories: z.array(technicalCategorySchema).max(15).optional(),
    locations: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    workArrangements: z.array(workArrangementSchema).max(4).optional(),
    minimumCompensation: z.number().finite().nonnegative().max(10_000_000).optional(),
    newlyFoundWithinHours: z.number().int().positive().max(8_760).optional(),
    reopenedOnly: z.boolean().optional(),
    deliveryFrequency: z.enum(["immediate", "daily"]).optional(),
  })
  .strict();

const alertFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  criteria: alertCriteriaSchema,
  channels: z.array(z.enum(["in_app", "email"])).min(1).max(2),
});

export const createAlertBodySchema = alertFieldsSchema
  .extend({ enabled: z.boolean().default(true) })
  .strict();
export const updateAlertBodySchema = alertFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one alert field is required.",
  });

export const notificationReadBodySchema = z
  .object({
    read: z.boolean().default(true),
  })
  .strict();

export const createEmergingBodySchema = z
  .object({
    companyName: z.string().trim().min(1).max(160),
    companyDomain: z.string().trim().min(3).max(253),
    reason: z.string().trim().min(10).max(2_000),
    discoverySource: z.string().trim().min(2).max(500),
    evidence: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
  })
  .strict();

export const reviewEmergingBodySchema = z
  .object({
    status: z.enum(["verified", "rejected"]),
    notes: z.string().trim().max(4_000).nullable().optional(),
    officialVerificationSource: z.string().url().max(2_000).nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "verified" && !value.officialVerificationSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["officialVerificationSource"],
        message: "Verified candidates require an official public source URL.",
      });
    }
  });

export const promoteEmergingBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(160)
      .optional(),
    careerUrl: z.string().url().max(2_000).optional(),
    logoUrl: z.string().url().max(2_000).nullable().optional(),
    categoryTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    priorityTier: z.number().int().min(1).max(5).optional(),
    groupIds: z.array(idSchema).max(50).optional(),
  })
  .strict()
  .default({});

export type UserJobStateInput = z.infer<typeof userJobStateBodySchema>;
export type UpdateUserPreferencesInput = z.infer<typeof userPreferencesBodySchema>;
export type CreateAlertInput = z.infer<typeof createAlertBodySchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertBodySchema>;
export type CreateEmergingInput = z.infer<typeof createEmergingBodySchema>;
export type ReviewEmergingInput = z.infer<typeof reviewEmergingBodySchema>;
export type PromoteEmergingInput = z.infer<typeof promoteEmergingBodySchema>;
