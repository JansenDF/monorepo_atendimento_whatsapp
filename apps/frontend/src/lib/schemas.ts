import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe sua senha'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Digite uma mensagem').max(4096, 'A mensagem deve ter até 4096 caracteres'),
});
export type MessageValues = z.infer<typeof messageSchema>;

export const transferSchema = z.object({
  departmentId: z.uuid('Selecione um departamento'),
  assigneeId: z.union([z.uuid(), z.literal('')]).optional(),
});
export type TransferValues = z.infer<typeof transferSchema>;

export const customerSchema = z.object({
  displayName: z.string().trim().min(2, 'Informe ao menos 2 caracteres').max(160),
  email: z.union([z.email('Informe um e-mail válido'), z.literal('')]),
  notes: z.string().max(4000).optional(),
});
export type CustomerValues = z.infer<typeof customerSchema>;
