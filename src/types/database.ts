// PixelForge Nexus — Database Types
// These types mirror the Supabase database schema

export type AppRole = 'admin' | 'project_lead' | 'developer';

export type ProjectStatus = 'active' | 'completed';

export type AppPermission =
  | 'projects.create'
  | 'projects.read'
  | 'projects.update'
  | 'projects.delete'
  | 'members.manage'
  | 'documents.upload'
  | 'documents.read'
  | 'documents.delete'
  | 'users.manage';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: number;
  user_id: string;
  role: AppRole;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: ProjectStatus;
  created_by: string;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  lead?: Profile;
  members?: ProjectMember[];
  member_count?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  assigned_by: string;
  assigned_at: string;
  // Joined fields
  profile?: Profile;
}

export interface Document {
  id: string;
  project_id: string;
  title: string;
  current_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator?: Profile;
  versions?: DocumentVersion[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  // Joined fields
  uploader?: Profile;
}

export interface UserWithRole extends Profile {
  user_roles: UserRole[];
}

// JWT custom claims
export interface CustomJWTClaims {
  user_role?: AppRole;
  aal?: 'aal1' | 'aal2';
}
