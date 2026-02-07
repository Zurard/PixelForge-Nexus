'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { loginSchema } from '@/lib/validations';

export async function signIn(formData: { email: string; password: string }) {
  // Server-side validation
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: 'Invalid email or password' };
  }

  // Check if MFA is needed
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
    redirect('/mfa-verify');
  }

  redirect('/dashboard');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function verifyMfa(code: string) {
  const supabase = await createClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();

  if (!factors || !factors.totp || factors.totp.length === 0) {
    return { error: 'No MFA factor found' };
  }

  const totpFactor = factors.totp[0];

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: totpFactor.id,
  });

  if (challengeError || !challenge) {
    return { error: 'Failed to create MFA challenge' };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: totpFactor.id,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    return { error: 'Invalid verification code. Please try again.' };
  }

  redirect('/dashboard');
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  return roleData?.role || null;
}
