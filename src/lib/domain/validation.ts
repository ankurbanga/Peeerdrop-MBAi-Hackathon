import { z } from "zod";
import { shareFields } from "./types";
const text = z.string().trim().max(200);
const optional = text.optional();
const https = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => new URL(v).protocol === "https:", "Use an HTTPS link");
export const fieldsSchema = z.array(z.enum(shareFields)).max(12);
export const profileSchema = z
  .object({
    displayName: text.min(1),
    details: z
      .object({
        hometown: optional,
        industry: optional,
        hobbies: z.array(text.min(1)).max(20).optional(),
        movies: z.array(text.min(1)).max(20).optional(),
        funFact: z.string().trim().max(500).optional(),
        relationshipStatus: optional,
        contact: z
          .object({
            phone: z
              .string()
              .trim()
              .max(40)
              .regex(/^[+()\d .-]*$/)
              .optional(),
            email: z
              .union([z.literal(""), z.string().trim().email().max(200)])
              .optional(),
            instagram: z.union([z.literal(""), https]).optional(),
            linkedin: z.union([z.literal(""), https]).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    defaultShareFields: fieldsSchema,
    graphVisible: z.boolean(),
    affiliationIds: z.array(z.string().uuid()).max(20),
  })
  .strict();
export const createExchangeSchema = z
  .object({
    shareFields: fieldsSchema,
    venue: optional,
    eventId: z.string().uuid().optional(),
  })
  .strict();
export const requestExchangeSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    shareFields: fieldsSchema,
  })
  .strict();
export const noteSchema = z
  .object({
    visibility: z.enum(["private", "shared"]),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export const noteEditSchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();
export const interestSchema = z
  .object({ interested: z.boolean(), shareWithConnections: z.boolean() })
  .strict();
export const uuidSchema = z.string().uuid();
