'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  
  // First verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', data: [] };

  // Get the user's role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const userRole = roleData?.role || 'developer';

  // Use admin client to bypass RLS issues
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('projects')
    .select(`
      *,
      project_members(user_id)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, data: [] };
  }

  // Fetch all lead profiles in one query
  const leadIds = (data || []).map(p => p.lead_id).filter(Boolean);
  let leadProfiles: Record<string, { id: string; full_name: string; email: string }> = {};
  
  if (leadIds.length > 0) {
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .in('id', leadIds);
    
    (profiles || []).forEach(p => {
      leadProfiles[p.id] = p;
    });
  }

  // Filter projects based on user role at application level
  let filteredProjects = data || [];

  if (userRole !== 'admin') {
    filteredProjects = filteredProjects.filter((p) => {
      // User is the lead
      if (p.lead_id === user.id) return true;
      // User is a member
      const isMember = (p.project_members || []).some(
        (m: { user_id: string }) => m.user_id === user.id
      );
      return isMember;
    });
  }

  // Transform to include member count and lead info
  const projects = filteredProjects.map((p) => ({
    ...p,
    lead: p.lead_id ? leadProfiles[p.lead_id] || null : null,
    member_count: p.project_members?.length || 0,
  }));

  return { data: projects };
}

export async function getProject(projectId: string) {
  const supabase = await createClient();
  
  // First verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', data: null };

  // Get the user's role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const userRole = roleData?.role || 'developer';

  // Use admin client to bypass RLS for fetching project details
  // Access control is enforced by checking membership/lead/admin status
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('projects')
    .select(`
      *,
      project_members(
        id,
        user_id,
        assigned_at
      )
    `)
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('getProject error:', error);
    if (error.code === 'PGRST116') {
      return { error: 'Project not found', data: null };
    }
    return { error: error.message, data: null };
  }

  // Fetch lead profile separately since lead_id references auth.users, not profiles
  let lead = null;
  if (data.lead_id) {
    const { data: leadProfile } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', data.lead_id)
      .single();
    lead = leadProfile;
  }

  // Fetch member profiles separately
  const memberUserIds = (data.project_members || []).map((m: { user_id: string }) => m.user_id);
  let memberProfiles: Record<string, { id: string; full_name: string; email: string }> = {};
  
  if (memberUserIds.length > 0) {
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .in('id', memberUserIds);
    
    (profiles || []).forEach(p => {
      memberProfiles[p.id] = p;
    });
  }

  // Attach profile to each member
  const membersWithProfiles = (data.project_members || []).map((m: { id: string; user_id: string; assigned_at: string }) => ({
    ...m,
    profile: memberProfiles[m.user_id] || null,
  }));

  const projectWithLead = { ...data, lead, project_members: membersWithProfiles };

  // Verify user has access to this project
  if (userRole === 'admin') {
    // Admins can access all projects
    return { data: projectWithLead };
  }

  // Check if user is the lead
  if (data.lead_id === user.id) {
    return { data: projectWithLead };
  }

  // Check if user is a member
  const isMember = (data.project_members || []).some(
    (m: { user_id: string }) => m.user_id === user.id
  );

  if (isMember) {
    return { data: projectWithLead };
  }

  return { error: 'Access denied - you are not a member of this project', data: null };
}
