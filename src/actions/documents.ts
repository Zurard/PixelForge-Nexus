'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function uploadDocument(
  projectId: string,
  title: string,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const file = formData.get('file') as File;
  if (!file || file.size === 0) {
    return { error: 'Please select a file to upload' };
  }

  if (title.length < 2) {
    return { error: 'Document title must be at least 2 characters' };
  }

  // Max file size: 50MB
  if (file.size > 52428800) {
    return { error: 'File size must be less than 50MB' };
  }

  // Create the document record first
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      project_id: projectId,
      title,
      current_version: 1,
      created_by: user.id,
    })
    .select()
    .single();

  if (docError) {
    return { error: docError.message };
  }

  // Upload file to storage
  const storagePath = `${projectId}/${doc.id}/v1-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    // Cleanup: delete the document record
    await supabase.from('documents').delete().eq('id', doc.id);
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // Create version record
  const { error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id: doc.id,
      version: 1,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      uploaded_by: user.id,
    });

  if (versionError) {
    return { error: `Version record failed: ${versionError.message}` };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true, documentId: doc.id };
}

export async function uploadNewVersion(documentId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const file = formData.get('file') as File;
  if (!file || file.size === 0) {
    return { error: 'Please select a file to upload' };
  }

  if (file.size > 52428800) {
    return { error: 'File size must be less than 50MB' };
  }

  // Get current document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('*, project_id')
    .eq('id', documentId)
    .single();

  if (docError || !doc) {
    return { error: 'Document not found' };
  }

  const newVersion = doc.current_version + 1;
  const storagePath = `${doc.project_id}/${documentId}/v${newVersion}-${file.name}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // Create version record and update document atomically
  const { error: versionError } = await supabase.rpc('create_document_version', {
    p_document_id: documentId,
    p_version: newVersion,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_file_size: file.size,
    p_mime_type: file.type || 'application/octet-stream',
    p_uploaded_by: user.id,
  });

  if (versionError) {
    return { error: `Version creation failed: ${versionError.message}` };
  }

  revalidatePath(`/dashboard/projects/${doc.project_id}`);
  return { success: true };
}

export async function getProjectDocuments(projectId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('documents')
    .select(`
      *,
      creator:profiles!documents_created_by_fkey(id, full_name, email),
      versions:document_versions(
        id,
        version,
        storage_path,
        file_name,
        file_size,
        mime_type,
        uploaded_by,
        created_at,
        uploader:profiles!document_versions_uploaded_by_fkey(id, full_name)
      )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message, data: [] };
  }

  // Sort versions within each document
  const docs = (data || []).map((doc) => ({
    ...doc,
    versions: (doc.versions || []).sort(
      (a: { version: number }, b: { version: number }) => b.version - a.version
    ),
  }));

  return { data: docs };
}

export async function getDocumentDownloadUrl(storagePath: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600); // 1 hour expiry

  if (error) {
    return { error: error.message };
  }

  return { url: data.signedUrl };
}

export async function deleteDocument(documentId: string, projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Get all versions to delete files from storage
  const { data: versions } = await supabase
    .from('document_versions')
    .select('storage_path')
    .eq('document_id', documentId);

  // Delete storage files
  if (versions && versions.length > 0) {
    const paths = versions.map((v) => v.storage_path);
    await supabase.storage.from('documents').remove(paths);
  }

  // Delete document (cascades to versions)
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true };
}
