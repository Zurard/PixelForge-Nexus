import { createClient } from '@/lib/supabase/server';
import { getProject } from '@/actions/projects';
import { getProjectDocuments } from '@/actions/documents';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from '@/components/projects/project-detail-client';
import type { AppRole } from '@/types/database';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = (roleData?.role || 'developer') as AppRole;

  const { data: project, error } = await getProject(id);
  if (error || !project) {
    notFound();
  }

  const { data: documents } = await getProjectDocuments(id);

  // Get all users for assignment dropdown (for admins and leads)
  let availableUsers: { id: string; full_name: string; email: string }[] = [];
  if (role === 'admin' || (role === 'project_lead' && project.lead_id === user.id)) {
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email');

    const existingMemberIds = new Set(
      (project.project_members || []).map((m: { user_id: string }) => m.user_id)
    );

    availableUsers = (allProfiles || []).filter(
      (p) => !existingMemberIds.has(p.id) && p.id !== project.lead_id
    );
  }

  // Get leads for assignment dropdown
  let availableLeads: { id: string; full_name: string; email: string }[] = [];
  if (role === 'admin') {
    const { data: leads } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id',
        (await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'project_lead'])
        ).data?.map(r => r.user_id) || []
      );
    availableLeads = leads || [];
  }

  return (
    <ProjectDetailClient
      project={project}
      documents={documents}
      role={role}
      userId={user.id}
      availableUsers={availableUsers}
      availableLeads={availableLeads}
    />
  );
}
