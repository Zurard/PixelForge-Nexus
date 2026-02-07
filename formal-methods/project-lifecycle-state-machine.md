# PixelForge Nexus — Project Lifecycle State Machine

Formal state machine specification for the project lifecycle in PixelForge Nexus.
This diagram models the primary project status transitions derived from the `projects.ts`
and `members.ts` server actions, the `ProjectStatus` enum (`'active' | 'completed'`),
and the Zod validation schemas in `validations.ts`.

## Roles

| Role             | Key                | Permissions                                                    |
| ---------------- | ------------------ | -------------------------------------------------------------- |
| **Admin**        | `admin`            | Create, read, update, delete projects; manage members and lead |
| **Project Lead** | `project_lead`     | Update project details; manage members                         |
| **Developer**    | `developer`        | Read-only access to assigned projects                          |

## State Machine

```mermaid
stateDiagram-v2
    %% =========================================================
    %%  Top-level Project Lifecycle
    %% =========================================================

    [*] --> FormDraft : Admin opens create-project form

    state "Form Draft" as FormDraft {
        [*] --> FillingForm
        FillingForm --> ZodValidation : Submit form\n(name, description, deadline, lead_id?)
        ZodValidation --> ValidationFailed : Zod parse fails
        ZodValidation --> ValidationPassed : Zod parse succeeds
        ValidationFailed --> FillingForm : Fix errors & resubmit
    }

    ValidationPassed --> Active : createProject()\n[Admin only]\nINSERT into DB\nstatus = 'active'

    %% ---------------------------------------------------------
    %%  Active state — the main operational state
    %% ---------------------------------------------------------
    state "Active (status = 'active')" as Active {
        [*] --> Idle

        state "Idle" as Idle
        state "Updating" as Updating
        state "Managing Team" as ManagingTeam

        Idle --> Updating : updateProject()\n[Admin or Lead]
        Updating --> Idle : Update succeeds\n(name / description /\ndeadline / lead_id)
        Updating --> Idle : Update fails\n(error returned)

        Idle --> ManagingTeam : Manage members\n[Admin or Lead]
        ManagingTeam --> Idle : Done managing

        %% =====================================================
        %%  Team Membership sub-state
        %% =====================================================
        state "Managing Team" as ManagingTeam {
            [*] --> TeamIdle

            state "Team Idle" as TeamIdle
            state "Assigning Member" as AssigningMember
            state "Removing Member" as RemovingMember

            TeamIdle --> AssigningMember : assignMember()\n[Admin or Lead]
            AssigningMember --> TeamIdle : Success\n(member added)
            AssigningMember --> TeamIdle : Fail — duplicate\n(error 23505)

            TeamIdle --> RemovingMember : removeMember()\n[Admin or Lead]
            RemovingMember --> TeamIdle : Success\n(member removed)
            RemovingMember --> TeamIdle : Fail\n(error returned)
        }

        %% =====================================================
        %%  Lead Assignment sub-state
        %% =====================================================
        state "Lead Lifecycle" as LeadLifecycle {
            [*] --> NoLead
            [*] --> LeadAssigned : lead_id provided\nat creation

            state "No Lead" as NoLead
            state "Lead Assigned" as LeadAssigned

            NoLead --> LeadAssigned : updateProject(lead_id)\n[Admin or Lead]
            LeadAssigned --> LeadAssigned : updateProject(lead_id)\n[Admin or Lead]\nLead changed
            LeadAssigned --> NoLead : updateProject(lead_id = null)\n[Admin]\nLead removed
        }
    }

    %% ---------------------------------------------------------
    %%  Completed state
    %% ---------------------------------------------------------
    state "Completed (status = 'completed')" as Completed

    Active --> Completed : markProjectComplete()\n[Admin only]\nstatus → 'completed'
    Completed --> Active : markProjectActive()\n[Admin only]\nstatus → 'active'

    %% ---------------------------------------------------------
    %%  Deletion — terminal state from either status
    %% ---------------------------------------------------------
    state "Deleted" as Deleted

    Active --> Deleted : deleteProject()\n[Admin only]\nCASCADE: members,\ndocuments, versions,\nstorage files
    Completed --> Deleted : deleteProject()\n[Admin only]\nCASCADE: members,\ndocuments, versions,\nstorage files

    Deleted --> [*]
```

## Transition Table

| #  | Source State | Trigger / Action          | Guard              | Target State | Side Effects                                      |
| -- | ------------ | ------------------------- | ------------------ | ------------ | ------------------------------------------------- |
| T1 | `[*]`        | Open create form          | Admin only         | Form Draft   | --                                                |
| T2 | Form Draft   | Submit form               | Zod validation     | Active       | `INSERT` into `projects`, `revalidatePath`        |
| T3 | Active       | `updateProject()`         | Admin or Lead      | Active       | `UPDATE` project row, `revalidatePath`            |
| T4 | Active       | `assignMember()`          | Admin or Lead      | Active       | `INSERT` into `project_members`, `revalidatePath` |
| T5 | Active       | `removeMember()`          | Admin or Lead      | Active       | `DELETE` from `project_members`, `revalidatePath` |
| T6 | Active       | `markProjectComplete()`   | Admin only         | Completed    | `UPDATE` status → `'completed'`, `revalidatePath` |
| T7 | Completed    | `markProjectActive()`     | Admin only         | Active       | `UPDATE` status → `'active'`, `revalidatePath`    |
| T8 | Active       | `deleteProject()`         | Admin only         | Deleted      | `DELETE` project row (cascade), `revalidatePath`  |
| T9 | Completed    | `deleteProject()`         | Admin only         | Deleted      | `DELETE` project row (cascade), `revalidatePath`  |

## Key Invariants

1. **Status domain**: A project's `status` is always exactly `'active'` or `'completed'` (enforced by the `project_status` Postgres enum and the Zod schema `z.enum(['active', 'completed'])`).
2. **No orphan transitions**: `markProjectComplete` and `markProjectActive` delegate to `updateProject`, so all status writes go through a single code path.
3. **Unique membership**: The `project_members` table has a unique constraint on `(project_id, user_id)` — duplicate assignment returns error code `23505`.
4. **Cascade on delete**: Deleting a project removes all associated `project_members`, `documents`, `document_versions`, and storage objects.
5. **Lead exclusion from members list**: `getAvailableMembers()` filters out the current `lead_id`, preventing the lead from being double-listed as a regular member.
6. **Authentication required**: Every server action verifies `supabase.auth.getUser()` before proceeding; unauthenticated requests receive `{ error: 'Unauthorized' }`.
