'use server';

import { createClient } from '@/lib/supabase/server';
import { createProjectSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function createProject(formData: {
  name: string;
  description: string;
  deadline: string;
  lead_id?: string;
}) {
  const parsed = createProjectSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase.from('projects').insert({
    name: parsed.data.name,
    description: parsed.data.description,
    deadline: new Date(parsed.data.deadline).toISOString(),
    created_by: user.id,
    lead_id: parsed.data.lead_id || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/projects');
  return { success: true };
}

export async function updateProject(
  projectId: string,
  formData: Partial<{
    name: string;
    description: string;
    deadline: string;
    status: string;
    lead_id: string;
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const updateData: Record<string, unknown> = {};
  if (formData.name) updateData.name = formData.name;
  if (formData.description) updateData.description = formData.description;
  if (formData.deadline) updateData.deadline = new Date(formData.deadline).toISOString();
  if (formData.status) updateData.status = formData.status;
  if (formData.lead_id !== undefined) updateData.lead_id = formData.lead_id || null;

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/projects');
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true };
}

export async function markProjectComplete(projectId: string) {
  return updateProject(projectId, { status: 'completed' });
}

export async function markProjectActive(projectId: string) {
  return updateProject(projectId, { status: 'active' });
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/projects');
  return { success: true };
}

export async function getProjects() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      lead:profiles!projects_lead_id_fkey(id, full_name, email),
      project_members(count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, data: [] };
  }

  // Transform count
  const projects = (data || []).map((p) => ({
    ...p,
    member_count: p.project_members?.[0]?.count || 0,
  }));

  return { data: projects };
}

export async function getProject(projectId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      lead:profiles!projects_lead_id_fkey(id, full_name, email),
      project_members(
        id,
        user_id,
        assigned_at,
        profile:profiles(id, full_name, email)
      )
    `)
    .eq('id', projectId)
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { data };
}
