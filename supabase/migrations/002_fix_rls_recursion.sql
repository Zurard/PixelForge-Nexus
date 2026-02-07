-- =====================================================
-- PixelForge Nexus — RLS Recursion Fix Patch
-- Run this in the Supabase SQL Editor to fix the
-- infinite recursion in RLS policies.
-- =====================================================

-- =====================================================
-- 1. Create SECURITY DEFINER helper functions
-- These bypass RLS internally, breaking circular chains
-- =====================================================

-- Returns project IDs where the current user is a member
CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid();
$$;

-- Returns project IDs where the current user is the lead
CREATE OR REPLACE FUNCTION public.get_my_led_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.projects WHERE lead_id = auth.uid();
$$;

-- Returns document IDs belonging to projects the current user leads
CREATE OR REPLACE FUNCTION public.get_my_led_document_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.id FROM public.documents d
  JOIN public.projects p ON d.project_id = p.id
  WHERE p.lead_id = auth.uid();
$$;

-- =====================================================
-- 2. Drop the 6 broken policies
-- =====================================================

-- Projects table
DROP POLICY IF EXISTS "Developers can view assigned projects" ON public.projects;
DROP POLICY IF EXISTS "Project leads can view assigned projects" ON public.projects;

-- Project members table
DROP POLICY IF EXISTS "Project leads can manage members of their projects" ON public.project_members;
DROP POLICY IF EXISTS "Developers can view members of their projects" ON public.project_members;

-- Documents table
DROP POLICY IF EXISTS "Project leads can manage documents of their projects" ON public.documents;

-- Document versions table
DROP POLICY IF EXISTS "Project leads can manage versions of their project docs" ON public.document_versions;
DROP POLICY IF EXISTS "Members can view versions of their project docs" ON public.document_versions;
DROP POLICY IF EXISTS "Members can view documents of their projects" ON public.documents;

-- =====================================================
-- 3. Recreate policies using helper functions
-- =====================================================

-- PROJECTS: Developers can view assigned projects
CREATE POLICY "Developers can view assigned projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    (SELECT (auth.jwt() ->> 'user_role')) = 'developer'
    AND id IN (SELECT public.get_my_project_ids())
  );

-- PROJECTS: Project leads can view assigned projects
CREATE POLICY "Project leads can view assigned projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    (SELECT (auth.jwt() ->> 'user_role')) = 'project_lead'
    AND id IN (SELECT public.get_my_project_ids())
  );

-- PROJECT MEMBERS: Project leads can manage members
CREATE POLICY "Project leads can manage members of their projects"
  ON public.project_members FOR ALL
  TO authenticated
  USING (
    (SELECT (auth.jwt() ->> 'user_role')) = 'project_lead'
    AND project_id IN (SELECT public.get_my_led_project_ids())
  )
  WITH CHECK (
    (SELECT (auth.jwt() ->> 'user_role')) = 'project_lead'
    AND project_id IN (SELECT public.get_my_led_project_ids())
  );

-- PROJECT MEMBERS: Developers can view members
CREATE POLICY "Developers can view members of their projects"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (
    project_id IN (SELECT public.get_my_project_ids())
  );

-- DOCUMENTS: Project leads can manage documents
CREATE POLICY "Project leads can manage documents of their projects"
  ON public.documents FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT public.get_my_led_project_ids())
  )
  WITH CHECK (
    project_id IN (SELECT public.get_my_led_project_ids())
  );

-- DOCUMENTS: Members can view documents
CREATE POLICY "Members can view documents of their projects"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    project_id IN (SELECT public.get_my_project_ids())
  );

-- DOCUMENT VERSIONS: Project leads can manage versions
CREATE POLICY "Project leads can manage versions of their project docs"
  ON public.document_versions FOR ALL
  TO authenticated
  USING (
    document_id IN (SELECT public.get_my_led_document_ids())
  )
  WITH CHECK (
    document_id IN (SELECT public.get_my_led_document_ids())
  );

-- DOCUMENT VERSIONS: Members can view versions
CREATE POLICY "Members can view versions of their project docs"
  ON public.document_versions FOR SELECT
  TO authenticated
  USING (
    document_id IN (
      SELECT d.id FROM public.documents d
      WHERE d.project_id IN (SELECT public.get_my_project_ids())
    )
  );
