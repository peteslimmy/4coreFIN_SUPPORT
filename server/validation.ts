import { z } from 'zod';

// ── Shared request/response validation schemas ──────────────────────────
// These mirror the payload shapes accepted by the Express API. Schemas are
// deliberately permissive (optional/loose where the server applies defaults)
// so validation only rejects genuinely malformed input. Unknown keys are
// stripped (Zod default) — never passed through to persistence.

export const emailSchema = z.string().email();

export const loginSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(1),
});

const ticketStatusSchema = z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED']);

export const ticketCreateSchema = z.object({
  id: z.string().max(50).optional(),
  customerName: z.string().max(200).optional(),
  customerEmail: z.string().max(254).optional(),
  customerPhone: z.string().max(30).optional(),
  customerLastName: z.string().max(100).optional(),
  customerId: z.string().max(50).optional(),
  businessUnit: z.string().max(100).optional(),
  partner: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: ticketStatusSchema.optional(),
  amount: z.number().optional(),
  transactionId: z.string().max(100).optional(),
  cardPan: z.string().max(30).optional(),
  description: z.string().max(10000).optional(),
  bankName: z.string().max(200).optional(),
  slaDeadline: z.string().max(30).optional(),
  assignedAgentId: z.string().max(200).optional(),
  majorIncidentId: z.string().max(50).nullable().optional(),
  watchers: z.array(z.string().max(254)).optional(),
  submittedBy: z.enum(['BU_SUPPORT', 'PARTNER', 'CUSTOMER']).optional(),
  submittedByName: z.string().max(200).optional(),
  submittedByPhone: z.string().max(30).optional(),
  rootCause: z.string().max(10000).optional(),
  correctiveAction: z.string().max(10000).optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  customFields: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean()])).optional(),
  duplicateOf: z.string().max(50).nullable().optional(),
});

export const ticketPatchSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(10000).optional(),
  amount: z.number().optional(),
  transactionId: z.string().max(100).optional(),
  partner: z.string().max(100).optional(),
  businessUnit: z.string().max(100).optional(),
  customerName: z.string().max(200).optional(),
  customerEmail: z.string().max(254).optional(),
  customerPhone: z.string().max(30).optional(),
  assignedAgentId: z.string().max(200).optional(),
  rootCause: z.string().max(10000).optional(),
  correctiveAction: z.string().max(10000).optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  isEscalated: z.boolean().optional(),
  escalationCount: z.number().optional(),
  bankName: z.string().max(200).optional(),
  watchers: z.array(z.string().max(254)).optional(),
  feedbackScore: z.number().nullable().optional(),
  feedbackComment: z.string().max(5000).nullable().optional(),
  isDeleted: z.boolean().optional(),
  customFields: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean()])).optional(),
  duplicateOf: z.string().max(50).optional(),
});

export const commentCreateSchema = z.object({
  ticketId: z.string().min(1),
  message: z.string().min(1),
  isInternal: z.boolean().optional(),
  parentCommentId: z.string().optional(),
});

export const notificationCreateSchema = z.object({
  ticketId: z.string().optional(),
  message: z.string().optional(),
  recipient: z.string().optional(),
});

export const majorIncidentCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  partner: z.string().optional(),
  category: z.string().optional(),
  severity: z.string().optional(),
  active: z.boolean().optional(),
  ticketCount: z.number().optional(),
  createdAt: z.string().optional(),
  status: z.string().optional(),
  timeline: z.array(z.unknown()).optional(),
  notifications: z.array(z.unknown()).optional(),
  pir: z.record(z.string(), z.unknown()).optional(),
});

export const customerCreateSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  businessUnit: z.string().optional(),
  createdAt: z.string().optional(),
  totalTickets: z.number().optional(),
  notes: z.string().optional(),
});

export const userCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().trim(),
  role: z.string().min(1),
  bu: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
});

export const userUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().trim().optional(),
  role: z.string().optional(),
  bu: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
});

export const unmaskSchema = z.object({
  field: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
export type TicketPatchInput = z.infer<typeof ticketPatchSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type NotificationCreateInput = z.infer<typeof notificationCreateSchema>;
export type MajorIncidentCreateInput = z.infer<typeof majorIncidentCreateSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
