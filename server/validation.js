import { z } from 'zod';
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export const dateSchema = z
  .string()
  .refine(validDate, 'Use a valid YYYY-MM-DD date (1900 or later).');
export const normalizePhone = (value) => {
  const compact = value
    .trim()
    .replace(/[\s()-]/g, '')
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  return compact.replace(/^(?:\+880|00880|880)/, '0');
};
export const patientSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^01\d{9}$/, 'Use an 11-digit Bangladesh mobile number.')),
    dateOfBirth: dateSchema.nullish(),
    estimatedAgeMonths: z.number().int().min(0).max(1560).nullish(),
    ageRecordedOn: dateSchema.nullish(),
    address: z.string().trim().max(500).default(''),
    contactName: z.string().trim().max(120).default(''),
  })
  .superRefine((v, ctx) => {
    if (
      v.dateOfBirth
        ? v.estimatedAgeMonths != null || v.ageRecordedOn != null
        : v.estimatedAgeMonths == null || v.ageRecordedOn == null
    )
      ctx.addIssue({
        code: 'custom',
        path: ['dateOfBirth'],
        message: 'Provide either date of birth OR estimated age with recording date.',
      });
  });
export const doctorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(100),
  fee: z.number().int().min(0).max(100000000),
  followupFee: z.number().int().min(0).max(100000000),
  capacity: z.number().int().min(1).max(500),
  active: z.boolean().default(true),
});
export const appointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  date: dateSchema,
  visitType: z.enum(['NEW', 'FOLLOW_UP']),
});
export const paymentSchema = z
  .object({
    amount: z.number().int().positive().max(100000000),
    method: z.enum(['CASH', 'MFS', 'CARD']),
    reference: z.string().trim().max(100).default(''),
    requestKey: z.string().uuid(),
  })
  .superRefine((v, c) => {
    if (v.method !== 'CASH' && !v.reference)
      c.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Transaction reference required.',
      });
  });
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const requireThat = (condition, status, message) => {
  if (!condition) throw new HttpError(status, message);
};
