import { z } from 'zod';

// =====================================================
// AUTH VALIDATIONS
// =====================================================
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  code: z
    .string()
    .length(6, 'Code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Code must contain only digits'),
});

export type MfaVerifyFormData = z.infer<typeof mfaVerifySchema>;

// =====================================================
// USER VALIDATIONS
// =====================================================
export const createUserSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'project_lead', 'developer']),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;

export const updateUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['admin', 'project_lead', 'developer']),
});

export type UpdateUserRoleFormData = z.infer<typeof updateUserRoleSchema>;

export const changePasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number')
      .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// =====================================================
// PROJECT VALIDATIONS
// =====================================================
export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  deadline: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && date > new Date();
  }, 'Deadline must be a future date'),
  lead_id: z.string().uuid('Please select a valid project lead').optional().or(z.literal('')),
});

export type CreateProjectFormData = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(['active', 'completed']).optional(),
});

export type UpdateProjectFormData = z.infer<typeof updateProjectSchema>;

// =====================================================
// TEAM ASSIGNMENT VALIDATIONS
// =====================================================
export const assignMemberSchema = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export type AssignMemberFormData = z.infer<typeof assignMemberSchema>;

// =====================================================
// DOCUMENT VALIDATIONS
// =====================================================
export const uploadDocumentSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(2, 'Document title must be at least 2 characters').max(200),
});

export type UploadDocumentFormData = z.infer<typeof uploadDocumentSchema>;
