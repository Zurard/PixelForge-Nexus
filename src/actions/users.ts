'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createUserSchema, updateUserRoleSchema, changePasswordSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function createUser(formData: {
  email: string;
  password: string;
  full_name: string;
  role: string;
}) {
  // Validate input
  const parsed = createUserSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  // Verify caller is admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleData?.role !== 'admin') {
    return { error: 'Only admins can create users' };
  }

  // Create user with admin client (bypasses email confirmation)
  const adminClient = createAdminClient();
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
    },
  });

  if (createError) {
    return { error: createError.message };
  }

  if (!newUser.user) {
    return { error: 'Failed to create user' };
  }

  // Assign role
  const { error: roleError } = await adminClient
    .from('user_roles')
    .insert({
      user_id: newUser.user.id,
      role: parsed.data.role,
    });

  if (roleError) {
    return { error: `User created but failed to assign role: ${roleError.message}` };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/admin/users');
  return { success: true, userId: newUser.user.id };
}

export async function updateUserRole(formData: { user_id: string; role: string }) {
  const parsed = updateUserRoleSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  // Verify caller is admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleData?.role !== 'admin') {
    return { error: 'Only admins can update roles' };
  }

  // Use admin client to bypass RLS
  const adminClient = createAdminClient();

  // Upsert the role
  const { error } = await adminClient
    .from('user_roles')
    .upsert(
      { user_id: parsed.data.user_id, role: parsed.data.role },
      { onConflict: 'user_id,role' }
    );

  if (error) {
    // If upsert failed due to conflict, try update
    const { error: deleteError } = await adminClient
      .from('user_roles')
      .delete()
      .eq('user_id', parsed.data.user_id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    const { error: insertError } = await adminClient
      .from('user_roles')
      .insert({ user_id: parsed.data.user_id, role: parsed.data.role });

    if (insertError) {
      return { error: insertError.message };
    }
  }

  revalidatePath('/dashboard/admin/users');
  return { success: true };
}

export async function deleteUser(userId: string) {
  // Verify caller is admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleData?.role !== 'admin') {
    return { error: 'Only admins can delete users' };
  }

  // Prevent self-deletion
  if (userId === user.id) {
    return { error: 'You cannot delete your own account' };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard/admin/users');
  return { success: true };
}

export async function changePassword(formData: {
  new_password: string;
  confirm_password: string;
}) {
  const parsed = changePasswordSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.new_password,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function getUsers() {
  // Use admin client to bypass RLS and ensure all users are fetched
  const adminClient = createAdminClient();

  // Fetch profiles
  const { data: profiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (profilesError) {
    console.error('getUsers profiles error:', profilesError);
    return { error: profilesError.message, data: [] };
  }

  // Fetch all user roles
  const { data: roles, error: rolesError } = await adminClient
    .from('user_roles')
    .select('user_id, role');

  if (rolesError) {
    console.error('getUsers roles error:', rolesError);
    return { error: rolesError.message, data: [] };
  }

  // Create a map of user_id -> roles
  const roleMap: Record<string, { role: string }[]> = {};
  (roles || []).forEach(r => {
    if (!roleMap[r.user_id]) {
      roleMap[r.user_id] = [];
    }
    roleMap[r.user_id].push({ role: r.role });
  });

  // Attach roles to each profile
  const usersWithRoles = (profiles || []).map(profile => ({
    ...profile,
    user_roles: roleMap[profile.id] || [],
  }));

  return { data: usersWithRoles };
}
