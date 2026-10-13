import { z } from "zod";
import { AGE_GROUPS, METHOD_NAMES, ROLES, STAGE_NAMES } from "./shared/constants.js";

const text = (max) => z.string().trim().max(max);

export const generateSchema = z
  .object({
    topic: text(120).min(2, "יש להזין נושא לפעולה"),
    value: text(120).default(""),
    ageGroup: z.enum(AGE_GROUPS, { error: "יש לבחור שכבת גיל מהרשימה" }),
    participants: z.coerce.number().int().min(1, "לפחות משתתף אחד").max(200, "עד 200 משתתפים").default(20),
    tribe: text(60).default("שבט מעוז"),
    battalion: text(60).default(""),
    instructor: text(60).min(1, "יש להזין שם מדריך/ה"),
    role: z.enum(ROLES).default("מדריך"),
    methods: z
      .array(
        z.object({
          name: z.enum(METHOD_NAMES, { error: "שיטה לא מוכרת" }),
          minutes: z.coerce.number().int().min(1, "לפחות דקה").max(120, "עד 120 דקות לשיטה"),
        }),
      )
      .min(1, "יש לבחור לפחות שיטה אחת")
      .max(12),
    activeScouting: z.boolean().default(false),
    energeticMode: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const names = v.methods.map((m) => m.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", path: ["methods"], message: "שיטה מופיעה פעמיים" });
    }
    const total = v.methods.reduce((s, m) => s + m.minutes, 0);
    if (total < 5 || total > 180) {
      ctx.addIssue({ code: "custom", path: ["methods"], message: "זמן הפעולה הכולל חייב להיות בין 5 ל-180 דקות" });
    }
  });

export const stageSchema = z.object({
  name: z.enum(STAGE_NAMES),
  minutes: z.coerce.number().int().min(1, "לפחות דקה לכל שלב").max(180),
  layer: text(80).min(1),
  content: text(3000).min(5, "תוכן השלב קצר מדי"),
});

export const stagesSchema = z.array(stageSchema).length(5, "חייבים להיות בדיוק 5 שלבים").superRefine((st, ctx) => {
  st.forEach((s, i) => {
    if (s.name !== STAGE_NAMES[i]) {
      ctx.addIssue({ code: "custom", path: [i, "name"], message: `שלב ${i + 1} חייב להיות "${STAGE_NAMES[i]}"` });
    }
  });
});

export const updateSchema = z
  .object({
    title: text(120).min(2),
    author: text(80).nullable(),
    instructor: text(80).nullable(),
    instructorRole: z.enum(ROLES).nullable(),
    tribe: text(60).min(1),
    battalion: text(60).nullable(),
    ageGroup: z.enum(AGE_GROUPS),
    groupSize: z.coerce.number().int().min(1).max(200),
    leadingValue: text(160).min(1),
    equipment: text(500).min(1),
    safetyNotes: text(1000).min(1),
    conclusionNote: text(1000).nullable(),
    tags: z.array(text(40)).max(20),
    stages: stagesSchema,
  })
  .partial();

export const loginSchema = z.object({ username: text(60).min(1), password: z.string().min(1).max(200) });
export const changePwSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים").max(200),
});

export const listQuerySchema = z.object({
  q: text(100).optional(),
  age: z.enum(AGE_GROUPS).optional(),
  value: text(100).optional(),
  method: z.enum(METHOD_NAMES).optional(),
  tag: text(40).optional(),
  minDuration: z.coerce.number().int().min(1).max(300).optional(),
  maxDuration: z.coerce.number().int().min(1).max(300).optional(),
  sort: z.enum(["new", "duration", "title"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export const duplicateSchema = z.object({
  ageGroup: z.enum(AGE_GROUPS).optional(),
  durationMin: z.coerce.number().int().min(5).max(180).optional(),
  title: text(120).optional(),
});
