'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  History,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { markProjectComplete, markProjectActive, updateProject, deleteProject } from '@/actions/projects';
import { assignMember, removeMember } from '@/actions/members';
import { uploadDocument, uploadNewVersion, getDocumentDownloadUrl, deleteDocument } from '@/actions/documents';
import type { AppRole } from '@/types/database';

interface ProjectMember {
  id: string;
  user_id: string;
  assigned_at: string;
  profile: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

interface DocumentVersion {
  id: string;
  version: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  uploader: { id: string; full_name: string } | null;
}

interface DocumentData {
  id: string;
  project_id: string;
  title: string;
  current_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: { id: string; full_name: string; email: string } | null;
  versions: DocumentVersion[];
}

interface ProjectData {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: string;
  created_by: string;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
  lead: { id: string; full_name: string; email: string } | null;
  project_members: ProjectMember[];
}

interface Props {
  project: ProjectData;
  documents: DocumentData[];
  role: AppRole;
  userId: string;
  availableUsers: { id: string; full_name: string; email: string }[];
  availableLeads: { id: string; full_name: string; email: string }[];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function ProjectDetailClient({
  project,
  documents,
  role,
  userId,
  availableUsers,
  availableLeads,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignLeadId, setAssignLeadId] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [versionDocId, setVersionDocId] = useState('');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const isAdmin = role === 'admin';
  const isLead = role === 'project_lead' && project.lead_id === userId;
  const canManageMembers = isAdmin || isLead;
  const canUpload = isAdmin || isLead;
  const canEdit = isAdmin;

  async function handleMarkComplete() {
    setLoading('complete');
    const result = await markProjectComplete(project.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Project marked as completed');
      router.refresh();
    }
    setLoading('');
  }

  async function handleMarkActive() {
    setLoading('active');
    const result = await markProjectActive(project.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Project reactivated');
      router.refresh();
    }
    setLoading('');
  }

  async function handleDelete() {
    setLoading('delete');
    const result = await deleteProject(project.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Project deleted');
      router.push('/dashboard/projects');
    }
    setLoading('');
  }

  async function handleAssignMember() {
    if (!assignUserId) return;
    setLoading('assign');
    const result = await assignMember(project.id, assignUserId);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Member assigned');
      setAssignUserId('');
      router.refresh();
    }
    setLoading('');
  }

  async function handleRemoveMember(memberId: string) {
    setLoading(`remove-${memberId}`);
    const result = await removeMember(project.id, memberId);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Member removed');
      router.refresh();
    }
    setLoading('');
  }

  async function handleAssignLead() {
    if (!assignLeadId) return;
    setLoading('assignLead');
    const result = await updateProject(project.id, { lead_id: assignLeadId });
    if (result.error) toast.error(result.error);
    else {
      toast.success('Project lead assigned');
      setAssignLeadId('');
      router.refresh();
    }
    setLoading('');
  }

  async function handleUploadDocument() {
    if (!docFile || !docTitle) return;
    setLoading('upload');
    const formData = new FormData();
    formData.append('file', docFile);
    const result = await uploadDocument(project.id, docTitle, formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Document uploaded');
      setDocTitle('');
      setDocFile(null);
      setUploadOpen(false);
      router.refresh();
    }
    setLoading('');
  }

  async function handleUploadNewVersion() {
    if (!versionFile || !versionDocId) return;
    setLoading('version');
    const formData = new FormData();
    formData.append('file', versionFile);
    const result = await uploadNewVersion(versionDocId, formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success('New version uploaded');
      setVersionFile(null);
      setVersionDocId('');
      setVersionOpen(false);
      router.refresh();
    }
    setLoading('');
  }

  async function handleDownload(storagePath: string, fileName: string) {
    setLoading(`download-${storagePath}`);
    const result = await getDocumentDownloadUrl(storagePath);
    if (result.error) {
      toast.error(result.error);
    } else if (result.url) {
      window.open(result.url, '_blank');
    }
    setLoading('');
  }

  async function handleDeleteDocument(docId: string) {
    setLoading(`delDoc-${docId}`);
    const result = await deleteDocument(docId, project.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Document deleted');
      router.refresh();
    }
    setLoading('');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
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
            </div>
            <p className="text-muted-foreground mt-1">{project.description}</p>
          </div>
        </div>
      </div>

      {/* Project Info & Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Deadline
            </div>
            <p className="font-semibold mt-1">
              {new Date(project.deadline).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Project Lead
            </div>
            <p className="font-semibold mt-1">
              {project.lead ? (project.lead as { full_name: string }).full_name : 'Unassigned'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              Documents
            </div>
            <p className="font-semibold mt-1">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {project.status === 'active' ? (
              <Button
                onClick={handleMarkComplete}
                disabled={loading === 'complete'}
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                {loading === 'complete' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Mark Complete
              </Button>
            ) : (
              <Button
                onClick={handleMarkActive}
                disabled={loading === 'active'}
                variant="outline"
              >
                {loading === 'active' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Reactivate
              </Button>
            )}

            {/* Assign Lead */}
            {availableLeads.length > 0 && (
              <div className="flex gap-2">
                <Select value={assignLeadId} onValueChange={setAssignLeadId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Assign lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLeads.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAssignLead}
                  disabled={!assignLeadId || loading === 'assignLead'}
                  size="sm"
                >
                  {loading === 'assignLead' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set Lead'}
                </Button>
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={loading === 'delete'}>
                  {loading === 'delete' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete Project
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete project?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete &ldquo;{project.name}&rdquo; and all associated
                    documents and team assignments. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                {project.project_members?.length || 0} member{(project.project_members?.length || 0) !== 1 ? 's' : ''} assigned
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Assign member */}
          {canManageMembers && availableUsers.length > 0 && (
            <div className="flex gap-2 pb-2">
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a team member to assign..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAssignMember}
                disabled={!assignUserId || loading === 'assign'}
              >
                {loading === 'assign' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {!project.project_members || project.project_members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No team members assigned yet.
            </p>
          ) : (
            <div className="space-y-2">
              {project.project_members.map((member: ProjectMember) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {member.profile?.full_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.profile?.email}
                    </p>
                  </div>
                  {canManageMembers && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={loading === `remove-${member.user_id}`}
                      className="text-destructive hover:text-destructive"
                    >
                      {loading === `remove-${member.user_id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserMinus className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Project Documents
              </CardTitle>
              <CardDescription>
                Upload and manage project documents with version control
              </CardDescription>
            </div>
            {canUpload && (
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>
                      Upload a new document to this project. Supported formats: PDF, Word, Excel, PowerPoint, images, text files.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Document Title</Label>
                      <Input
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="e.g., Game Design Document"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>File</Label>
                      <Input
                        type="file"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.zip,.json"
                      />
                    </div>
                    <Button
                      onClick={handleUploadDocument}
                      disabled={!docFile || !docTitle || loading === 'upload'}
                      className="w-full"
                    >
                      {loading === 'upload' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Document
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No documents uploaded yet.
              {canUpload && ' Click "Upload" to add the first document.'}
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc: DocumentData) => (
                <div key={doc.id} className="border rounded-lg">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          v{doc.current_version} &middot; by {doc.creator?.full_name || 'Unknown'} &middot;{' '}
                          {new Date(doc.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Download latest version */}
                      {doc.versions && doc.versions.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleDownload(doc.versions[0].storage_path, doc.versions[0].file_name)
                          }
                          disabled={loading === `download-${doc.versions[0].storage_path}`}
                          title="Download latest version"
                        >
                          {loading === `download-${doc.versions[0].storage_path}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {/* Version history toggle */}
                      {doc.versions && doc.versions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setExpandedDoc(expandedDoc === doc.id ? null : doc.id)
                          }
                          title="Version history"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Upload new version */}
                      {canUpload && (
                        <Dialog
                          open={versionOpen && versionDocId === doc.id}
                          onOpenChange={(open) => {
                            setVersionOpen(open);
                            if (open) setVersionDocId(doc.id);
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Upload new version">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Upload New Version</DialogTitle>
                              <DialogDescription>
                                Upload a new version of &ldquo;{doc.title}&rdquo;. Current version: v{doc.current_version}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>File</Label>
                                <Input
                                  type="file"
                                  onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.zip,.json"
                                />
                              </div>
                              <Button
                                onClick={handleUploadNewVersion}
                                disabled={!versionFile || loading === 'version'}
                                className="w-full"
                              >
                                {loading === 'version' ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Upload v{doc.current_version + 1}
                                  </>
                                )}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {/* Delete document */}
                      {canUpload && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              title="Delete document"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete document?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete &ldquo;{doc.title}&rdquo; and all its versions permanently.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>

                  {/* Version History (expandable) */}
                  {expandedDoc === doc.id && doc.versions && doc.versions.length > 0 && (
                    <div className="border-t bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Version History
                      </p>
                      {doc.versions.map((v: DocumentVersion) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between text-sm py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              v{v.version}
                            </Badge>
                            <span className="text-muted-foreground">
                              {v.file_name} ({formatFileSize(v.file_size)})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {v.uploader?.full_name} &middot; {new Date(v.created_at).toLocaleDateString()}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDownload(v.storage_path, v.file_name)}
                              disabled={loading === `download-${v.storage_path}`}
                            >
                              {loading === `download-${v.storage_path}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
