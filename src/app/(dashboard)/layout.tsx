import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user profile and role
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const userInfo = {
    id: user.id,
    email: user.email || '',
    full_name: profile?.full_name || user.email || '',
    role: roleData?.role || 'developer',
    avatar_url: profile?.avatar_url,
  };

  return (
    <DashboardShell user={userInfo}>
      {children}
    </DashboardShell>
  );
}
