'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Shield, Trash2, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { createUser, updateUserRole, deleteUser } from '@/actions/users';
import type { AppRole } from '@/types/database';

interface UserData {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  user_roles: { role: AppRole }[];
}

const roleColors: Record<AppRole, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  project_lead: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  developer: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  project_lead: 'Project Lead',
  developer: 'Developer',
};

export function UserManagementClient({
  users,
  currentUserId,
}: {
  users: UserData[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Create user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('developer');

  async function handleCreateUser() {
    setLoading('create');
    const result = await createUser({
      email: newEmail,
      password: newPassword,
      full_name: newName,
      role: newRole,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('User created successfully');
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('developer');
      setCreateOpen(false);
      router.refresh();
    }
    setLoading('');
  }

  async function handleUpdateRole(userId: string, role: AppRole) {
    setLoading(`role-${userId}`);
    const result = await updateUserRole({ user_id: userId, role });
    if (result.error) toast.error(result.error);
    else {
      toast.success('Role updated');
      router.refresh();
    }
    setLoading('');
  }

  async function handleDeleteUser(userId: string) {
    setLoading(`delete-${userId}`);
    const result = await deleteUser(userId);
    if (result.error) toast.error(result.error);
    else {
      toast.success('User deleted');
      router.refresh();
    }
    setLoading('');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage team member accounts and roles
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new team member. They will receive login credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="john@pixelforge.dev"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, uppercase, lowercase, number, special"
                />
                <p className="text-xs text-muted-foreground">
                  Must contain: uppercase, lowercase, number, special character
                </p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="project_lead">Project Lead</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleCreateUser}
                disabled={!newEmail || !newPassword || !newName || loading === 'create'}
                className="w-full"
              >
                {loading === 'create' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create User
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members ({users.length})
          </CardTitle>
          <CardDescription>
            All registered team members and their roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u: UserData) => {
                const userRole = u.user_roles?.[0]?.role || 'developer';
                const isCurrentUser = u.id === currentUserId;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.full_name}
                      {isCurrentUser && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={userRole}
                        onValueChange={(v) => handleUpdateRole(u.id, v as AppRole)}
                        disabled={isCurrentUser || loading === `role-${u.id}`}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue>
                            <Badge className={`${roleColors[userRole as AppRole]} border-0`}>
                              {roleLabels[userRole as AppRole]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="developer">Developer</SelectItem>
                          <SelectItem value="project_lead">Project Lead</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isCurrentUser && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              disabled={loading === `delete-${u.id}`}
                            >
                              {loading === `delete-${u.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete user?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete {u.full_name}&apos;s account and remove them from all projects.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(u.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
