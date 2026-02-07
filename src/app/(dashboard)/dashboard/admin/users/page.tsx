import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getUsers } from '@/actions/users';
import { UserManagementClient } from '@/components/admin/user-management-client';

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Check if admin
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleData?.role !== 'admin') {
    redirect('/dashboard');
  }

  const { data: users } = await getUsers();

  return (
    <UserManagementClient users={users} currentUserId={user.id} />
  );
}
