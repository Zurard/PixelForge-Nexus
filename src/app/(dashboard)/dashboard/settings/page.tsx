'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Shield, ShieldCheck, ShieldOff, Key, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { changePassword } from '@/actions/users';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState('');

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // MFA
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  async function checkMfaStatus() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    if (data && data.totp && data.totp.length > 0) {
      const activeFactor = data.totp.find((f) => f.status === 'verified');
      if (activeFactor) {
        setMfaEnabled(true);
        setMfaFactorId(activeFactor.id);
      }
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading('password');
    const result = await changePassword({
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    }
    setLoading('');
  }

  async function handleEnrollMfa() {
    setLoading('enrollMfa');
    const supabase = createClient();

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'PixelForge Nexus',
    });

    if (error) {
      toast.error(error.message);
      setLoading('');
      return;
    }

    if (data) {
      setMfaFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      setEnrolling(true);
    }
    setLoading('');
  }

  async function handleVerifyMfa() {
    if (verifyCode.length !== 6) return;
    setLoading('verifyMfa');
    const supabase = createClient();

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: mfaFactorId,
    });

    if (challengeError) {
      toast.error(challengeError.message);
      setLoading('');
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: verifyCode,
    });

    if (verifyError) {
      toast.error('Invalid code. Please try again.');
      setVerifyCode('');
    } else {
      toast.success('MFA enabled successfully!');
      setMfaEnabled(true);
      setEnrolling(false);
      setQrCode('');
      setMfaSecret('');
      setVerifyCode('');
    }
    setLoading('');
  }

  async function handleDisableMfa() {
    setLoading('disableMfa');
    const supabase = createClient();

    const { error } = await supabase.auth.mfa.unenroll({
      factorId: mfaFactorId,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('MFA disabled');
      setMfaEnabled(false);
      setMfaFactorId('');
      setEnrolling(false);
      // Refresh session
      await supabase.auth.refreshSession();
    }
    setLoading('');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your password and security settings
        </p>
      </div>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password. Must contain uppercase, lowercase, number, and special character.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  disabled={loading === 'password'}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={loading === 'password'}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={
                loading === 'password' ||
                !newPassword ||
                newPassword !== confirmPassword ||
                newPassword.length < 8
              }
            >
              {loading === 'password' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* MFA Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Multi-Factor Authentication (MFA)
            {mfaEnabled ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 ml-2">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2">
                <ShieldOff className="mr-1 h-3 w-3" />
                Disabled
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Add an extra layer of security using a Time-based One-Time Password (TOTP) authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mfaEnabled && !enrolling ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    MFA is active
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Your account is protected with two-factor authentication.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={handleDisableMfa}
                disabled={loading === 'disableMfa'}
              >
                {loading === 'disableMfa' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  <>
                    <ShieldOff className="mr-2 h-4 w-4" />
                    Disable MFA
                  </>
                )}
              </Button>
            </div>
          ) : enrolling ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  1. Scan this QR code with your authenticator app:
                </p>
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <div dangerouslySetInnerHTML={{ __html: qrCode }} />
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Can&apos;t scan? Enter this code manually
                  </summary>
                  <code className="block mt-2 p-2 bg-muted rounded text-xs font-mono break-all">
                    {mfaSecret}
                  </code>
                </details>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  2. Enter the 6-digit verification code:
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-xl tracking-[0.5em] font-mono max-w-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleVerifyMfa}
                  disabled={verifyCode.length !== 6 || loading === 'verifyMfa'}
                >
                  {loading === 'verifyMfa' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Enable'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEnrolling(false);
                    setQrCode('');
                    setMfaSecret('');
                    setVerifyCode('');
                    // Unenroll the pending factor
                    if (mfaFactorId) {
                      const supabase = createClient();
                      supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
                    }
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={handleEnrollMfa}
              disabled={loading === 'enrollMfa'}
            >
              {loading === 'enrollMfa' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Enable MFA
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
