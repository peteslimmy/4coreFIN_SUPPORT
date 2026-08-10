import { z } from 'zod';

// ── Shared request/response validation schemas ──────────────────────────
// These mirror the payload shapes accepted by the Express API. Schemas are
// deliberately permissive (optional/loose where the server applies defaults)
// so validation only rejects genuinely malformed input.

export const emailSchema = z.string().email();

export const loginSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(1),
});

export const ticketCreateSchema = z.object({
  id: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  customerLastName: z.string().optional(),
  customerId: z.string().optional(),
  businessUnit: z.string().optional(),
  partner: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED']).optional(),
  amount: z.number().optional(),
  transactionId: z.string().optional(),
  cardPan: z.string().optional(),
  description: z.string().optional(),
  bankName: z.string().optional(),
  slaDeadline: z.string().optional(),
  assignedAgentId: z.string().optional(),
  majorIncidentId: z.string().nullable().optional(),
  watchers: z.array(z.string()).optional(),
  submittedBy: z.enum(['BU_SUPPORT', 'CUSTOMER']).optional(),
  submittedByName: z.string().optional(),
  submittedByPhone: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  duplicateOf: z.string().nullable().optional(),
}).passthrough();

export const ticketPatchSchema = z.object({
  status: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  transactionId: z.string().optional(),
  partner: z.string().optional(),
  businessUnit: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  assignedAgentId: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  isEscalated: z.boolean().optional(),
  escalationCount: z.number().optional(),
  bankName: z.string().optional(),
  watchers: z.array(z.string()).optional(),
  feedbackScore: z.number().nullable().optional(),
  feedbackComment: z.string().nullable().optional(),
  isDeleted: z.boolean().optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  duplicateOf: z.string().optional(),
}).passthrough();

export const commentCreateSchema = z.object({
  ticketId: z.string().min(1),
  message: z.string().min(1),
  isInternal: z.boolean().optional(),
  parentCommentId: z.string().optional(),
}).passthrough();

export const notificationCreateSchema = z.object({
  ticketId: z.string().optional(),
  message: z.string().optional(),
  recipient: z.string().optional(),
}).passthrough();

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
}).passthrough();

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
}).passthrough();

export const userCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().trim(),
  role: z.string().min(1),
  bu: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
}).passthrough();

export const userUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().trim().optional(),
  role: z.string().optional(),
  bu: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
}).passthrough();

export const unmaskSchema = z.object({
  field: z.string().optional(),
}).passthrough();

export type LoginInput = z.infer<typeof loginSchema>;
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
export type TicketPatchInput = z.infer<typeof ticketPatchSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type NotificationCreateInput = z.infer<typeof notificationCreateSchema>;
export type MajorIncidentCreateInput = z.infer<typeof majorIncidentCreateSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
