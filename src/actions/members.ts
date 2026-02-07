'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function assignMember(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase.from('project_members').insert({
    project_id: projectId,
    user_id: userId,
    assigned_by: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'This user is already assigned to this project' };
    }
    return { error: error.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true };
}

export async function removeMember(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true };
}

export async function getAvailableMembers(projectId: string) {
  const supabase = await createClient();

  // Get all profiles
  const { data: allProfiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email');

  if (profileError) {
    return { error: profileError.message, data: [] };
  }

  // Get existing members of this project
  const { data: existingMembers } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);

  const existingIds = new Set((existingMembers || []).map((m) => m.user_id));

  // Get the project lead
  const { data: project } = await supabase
    .from('projects')
    .select('lead_id')
    .eq('id', projectId)
    .single();

  // Filter out existing members and the project lead
  const available = (allProfiles || []).filter(
    (p) => !existingIds.has(p.id) && p.id !== project?.lead_id
  );

  return { data: available };
}
