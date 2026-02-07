import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, Users, FileText, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { AppRole } from '@/types/database';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = (roleData?.role || 'developer') as AppRole;

  // Fetch stats based on role
  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, name, status, deadline, lead_id');

  const projects = allProjects || [];
  const activeProjects = projects.filter((p) => p.status === 'active');
  const completedProjects = projects.filter((p) => p.status === 'completed');

  // Get user's assigned projects
  const { data: memberData } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', user.id);

  const myProjectIds = new Set((memberData || []).map((m) => m.project_id));
  
  // For leads, also include projects they lead
  const ledProjects = projects.filter((p) => p.lead_id === user.id);
  ledProjects.forEach((p) => myProjectIds.add(p.id));

  // Get user count (admin only)
  let userCount = 0;
  if (role === 'admin') {
    const { data: users } = await supabase.from('profiles').select('id');
    userCount = users?.length || 0;
  }

  // Get document count
  const { data: docs } = await supabase.from('documents').select('id');
  const docCount = docs?.length || 0;

  const stats = [
    {
      title: 'Active Projects',
      value: activeProjects.length,
      icon: FolderKanban,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Completed',
      value: completedProjects.length,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    ...(role === 'admin'
      ? [
          {
            title: 'Team Members',
            value: userCount,
            icon: Users,
            color: 'text-purple-600',
            bgColor: 'bg-purple-100 dark:bg-purple-900/30',
          },
        ]
      : [
          {
            title: 'My Projects',
            value: myProjectIds.size,
            icon: FolderKanban,
            color: 'text-orange-600',
            bgColor: 'bg-orange-100 dark:bg-orange-900/30',
          },
        ]),
    {
      title: 'Documents',
      value: docCount,
      icon: FileText,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
  ];

  // Recent projects for the user
  const recentProjects = role === 'admin'
    ? projects.slice(0, 5)
    : projects.filter((p) => myProjectIds.has(p.id)).slice(0, 5);

  const roleLabels: Record<AppRole, string> = {
    admin: 'Admin',
    project_lead: 'Project Lead',
    developer: 'Developer',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! You are logged in as <Badge variant="outline">{roleLabels[role]}</Badge>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Projects */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
          <CardDescription>
            {role === 'admin' ? 'All active projects' : 'Projects you are involved in'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No projects found.{' '}
              {role === 'admin' && (
                <Link href="/dashboard/projects/new" className="text-primary underline">
                  Create one
                </Link>
              )}
            </p>
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FolderKanban className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Due: {new Date(project.deadline).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={project.status === 'active' ? 'default' : 'secondary'}
                    className={
                      project.status === 'completed'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : ''
                    }
                  >
                    {project.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
