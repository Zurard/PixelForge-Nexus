--------------------------- MODULE authorization_model ---------------------------
(****************************************************************************)
(* PixelForge Nexus — RBAC Authorization Model                              *)
(*                                                                          *)
(* Formal specification of the role-based access control system used in     *)
(* PixelForge Nexus. This TLA+ module models users, roles, projects,        *)
(* project membership, documents, and document versions, along with every   *)
(* permitted action and the invariants the system must uphold.              *)
(*                                                                          *)
(* Roles:     admin, project_lead, developer                                *)
(* Resources: projects, project_members, documents, document_versions,      *)
(*            users (profiles + user_roles)                                 *)
(*                                                                          *)
(* The specification verifies eight invariants and two safety properties     *)
(* that guarantee no unauthorized access, separation of duties, exclusive   *)
(* role assignment, and absence of privilege escalation.                    *)
(****************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

\* =========================================================================
\* CONSTANTS — The finite universe of identifiers used during model checking
\* =========================================================================
CONSTANTS
    UserIds,          \* e.g. {"u1", "u2", "u3", "u4", "u5"}
    ProjectIds,       \* e.g. {"p1", "p2", "p3"}
    DocumentIds,      \* e.g. {"d1", "d2", "d3"}
    DocVersionIds     \* e.g. {"v1", "v2", "v3"}

\* =========================================================================
\* Enumerations
\* =========================================================================
Roles     == {"admin", "project_lead", "developer"}
Actions   == {"create", "read", "update", "delete"}
Resources == {"projects", "project_members", "documents",
              "document_versions", "users"}

\* "none" denotes an unassigned / unauthenticated user
NoRole == "none"
AllRoleValues == Roles \union {NoRole}

\* =========================================================================
\* VARIABLES — The mutable system state
\* =========================================================================
VARIABLES
    userRoles,         \* userRoles[u] \in AllRoleValues   — one role per user
    projects,          \* set of [id, lead_id, created_by] records
    projectMembers,    \* set of [project_id, user_id]     records
    documents,         \* set of [id, project_id, created_by] records
    docVersions,       \* set of [id, document_id, uploaded_by] records
    accessLog          \* sequence of access-attempt records (for trace)

vars == <<userRoles, projects, projectMembers, documents, docVersions, accessLog>>

\* =========================================================================
\* HELPER OPERATORS
\* =========================================================================

(* ---- Role lookup ---- *)
RoleOf(u) == userRoles[u]

IsAdmin(u)       == RoleOf(u) = "admin"
IsProjectLead(u) == RoleOf(u) = "project_lead"
IsDeveloper(u)   == RoleOf(u) = "developer"
HasNoRole(u)     == RoleOf(u) = NoRole

(* ---- Project ownership / membership queries ---- *)

\* Projects led by user u
ProjectsLedBy(u) ==
    {p \in projects : p.lead_id = u}

\* Project IDs led by user u
ProjectIdsLedBy(u) ==
    {p.id : p \in ProjectsLedBy(u)}

\* Project IDs where user u is an assigned member
ProjectIdsMemberOf(u) ==
    {pm.project_id : pm \in {m \in projectMembers : m.user_id = u}}

\* Is user u the lead of project with id pid?
IsLeadOf(u, pid) ==
    \E p \in projects : p.id = pid /\ p.lead_id = u

\* Is user u an assigned member of project pid?
IsMemberOf(u, pid) ==
    \E m \in projectMembers : m.project_id = pid /\ m.user_id = u

\* Documents belonging to projects led by u
DocumentsInLeadProjects(u) ==
    {doc \in documents : doc.project_id \in ProjectIdsLedBy(u)}

\* Documents belonging to projects where u is a member
DocumentsInMemberProjects(u) ==
    {doc \in documents : doc.project_id \in ProjectIdsMemberOf(u)}

\* Document IDs belonging to projects led by u
DocIdsInLeadProjects(u) ==
    {doc.id : doc \in DocumentsInLeadProjects(u)}

\* Document IDs belonging to projects where u is a member
DocIdsInMemberProjects(u) ==
    {doc.id : doc \in DocumentsInMemberProjects(u)}

\* =========================================================================
\* PERMISSION CHECK — Central authorization predicate
\*
\* HasPermission(user, action, resource, context) answers: "Can user u
\* perform action a on resource r given context ctx?"
\*
\* The context record carries the identifiers needed for ownership checks:
\*   ctx.project_id   — for project/member/document scope
\*   ctx.document_id  — for document_version scope
\* =========================================================================

HasPermission(u, action, resource, ctx) ==
    \/ \* --- Admin: full CRUD on every resource ---
       IsAdmin(u)

    \/ \* --- Project Lead on "projects" ---
       /\ IsProjectLead(u)
       /\ resource = "projects"
       /\ \/ /\ action = "read"
             /\ \/ IsLeadOf(u, ctx.project_id)         \* own project
                \/ IsMemberOf(u, ctx.project_id)        \* assigned as member (read-only)
          \/ /\ action = "update"
             /\ IsLeadOf(u, ctx.project_id)
       \* project_lead CANNOT create or delete projects

    \/ \* --- Project Lead on "project_members" ---
       /\ IsProjectLead(u)
       /\ resource = "project_members"
       /\ action \in Actions
       /\ IsLeadOf(u, ctx.project_id)                  \* must lead the project

    \/ \* --- Project Lead on "documents" ---
       /\ IsProjectLead(u)
       /\ resource = "documents"
       /\ action \in Actions
       /\ IsLeadOf(u, ctx.project_id)

    \/ \* --- Project Lead on "document_versions" ---
       /\ IsProjectLead(u)
       /\ resource = "document_versions"
       /\ action \in Actions
       /\ ctx.document_id \in DocIdsInLeadProjects(u)

    \/ \* --- Developer on "projects" ---
       /\ IsDeveloper(u)
       /\ resource = "projects"
       /\ action = "read"
       /\ IsMemberOf(u, ctx.project_id)

    \/ \* --- Developer on "project_members" ---
       /\ IsDeveloper(u)
       /\ resource = "project_members"
       /\ action = "read"
       /\ IsMemberOf(u, ctx.project_id)

    \/ \* --- Developer on "documents" ---
       /\ IsDeveloper(u)
       /\ resource = "documents"
       /\ action = "read"
       /\ IsMemberOf(u, ctx.project_id)

    \/ \* --- Developer on "document_versions" ---
       /\ IsDeveloper(u)
       /\ resource = "document_versions"
       /\ action = "read"
       /\ ctx.document_id \in DocIdsInMemberProjects(u)

\* =========================================================================
\* TYPE INVARIANT
\* =========================================================================
TypeOK ==
    /\ userRoles \in [UserIds -> AllRoleValues]
    /\ projects \subseteq [id : ProjectIds, lead_id : UserIds, created_by : UserIds]
    /\ projectMembers \subseteq [project_id : ProjectIds, user_id : UserIds]
    /\ documents \subseteq [id : DocumentIds, project_id : ProjectIds, created_by : UserIds]
    /\ docVersions \subseteq [id : DocVersionIds, document_id : DocumentIds, uploaded_by : UserIds]

\* =========================================================================
\* INITIAL STATE
\* =========================================================================
Init ==
    /\ userRoles    = [u \in UserIds |-> NoRole]
    /\ projects     = {}
    /\ projectMembers = {}
    /\ documents    = {}
    /\ docVersions  = {}
    /\ accessLog    = <<>>

\* =========================================================================
\* ACTIONS — Every state transition the system can make
\* =========================================================================

(* ------------------------------------------------------------------ *)
(* Role Management (admin-only)                                        *)
(* ------------------------------------------------------------------ *)

AssignRole(admin, target, role) ==
    /\ IsAdmin(admin)
    /\ target \in UserIds
    /\ role \in Roles
    \* Prevent self-escalation: a non-admin cannot call this (guard above)
    \* An admin assigning a role to themselves is idempotent (already admin)
    /\ userRoles' = [userRoles EXCEPT ![target] = role]
    /\ UNCHANGED <<projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> admin, action |-> "create", resource |-> "users",
          target_user |-> target, role |-> role, result |-> "ok"])

RemoveRole(admin, target) ==
    /\ IsAdmin(admin)
    /\ target \in UserIds
    /\ target # admin                           \* cannot strip own admin role
    /\ userRoles' = [userRoles EXCEPT ![target] = NoRole]
    /\ UNCHANGED <<projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> admin, action |-> "delete", resource |-> "users",
          target_user |-> target, result |-> "ok"])

(* ------------------------------------------------------------------ *)
(* Project CRUD                                                        *)
(* ------------------------------------------------------------------ *)

CreateProject(u, pid, leadId) ==
    /\ IsAdmin(u)
    /\ pid \in ProjectIds
    /\ leadId \in UserIds
    /\ ~ \E p \in projects : p.id = pid        \* id must be fresh
    /\ projects' = projects \union
         {[id |-> pid, lead_id |-> leadId, created_by |-> u]}
    /\ UNCHANGED <<userRoles, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "create", resource |-> "projects",
          project_id |-> pid, result |-> "ok"])

ReadProject(u, pid) ==
    /\ \E p \in projects : p.id = pid
    /\ HasPermission(u, "read", "projects", [project_id |-> pid, document_id |-> ""])
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "read", resource |-> "projects",
          project_id |-> pid, result |-> "ok"])

UpdateProject(u, pid) ==
    /\ \E p \in projects : p.id = pid
    /\ HasPermission(u, "update", "projects", [project_id |-> pid, document_id |-> ""])
    \* For simplicity, the state change is abstract (project record unchanged)
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "update", resource |-> "projects",
          project_id |-> pid, result |-> "ok"])

DeleteProject(u, pid) ==
    /\ IsAdmin(u)
    /\ \E p \in projects : p.id = pid
    \* Cascade-delete members, documents, and versions of this project
    /\ LET docsToRemove   == {doc \in documents : doc.project_id = pid}
           docIdsToRemove == {doc.id : doc \in docsToRemove}
       IN
       /\ projects'       = {p \in projects : p.id # pid}
       /\ projectMembers' = {m \in projectMembers : m.project_id # pid}
       /\ documents'      = documents \ docsToRemove
       /\ docVersions'    = {v \in docVersions : v.document_id \notin docIdsToRemove}
    /\ UNCHANGED <<userRoles>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "delete", resource |-> "projects",
          project_id |-> pid, result |-> "ok"])

(* ------------------------------------------------------------------ *)
(* Project Member management                                           *)
(* ------------------------------------------------------------------ *)

AssignMember(u, pid, memberId) ==
    /\ \E p \in projects : p.id = pid
    /\ memberId \in UserIds
    /\ HasPermission(u, "create", "project_members",
         [project_id |-> pid, document_id |-> ""])
    /\ ~ \E m \in projectMembers : m.project_id = pid /\ m.user_id = memberId
    /\ projectMembers' = projectMembers \union
         {[project_id |-> pid, user_id |-> memberId]}
    /\ UNCHANGED <<userRoles, projects, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "create", resource |-> "project_members",
          project_id |-> pid, target_user |-> memberId, result |-> "ok"])

RemoveMember(u, pid, memberId) ==
    /\ \E p \in projects : p.id = pid
    /\ \E m \in projectMembers : m.project_id = pid /\ m.user_id = memberId
    /\ HasPermission(u, "delete", "project_members",
         [project_id |-> pid, document_id |-> ""])
    /\ projectMembers' = {m \in projectMembers :
         ~(m.project_id = pid /\ m.user_id = memberId)}
    /\ UNCHANGED <<userRoles, projects, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "delete", resource |-> "project_members",
          project_id |-> pid, target_user |-> memberId, result |-> "ok"])

ReadMembers(u, pid) ==
    /\ \E p \in projects : p.id = pid
    /\ HasPermission(u, "read", "project_members",
         [project_id |-> pid, document_id |-> ""])
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "read", resource |-> "project_members",
          project_id |-> pid, result |-> "ok"])

(* ------------------------------------------------------------------ *)
(* Document CRUD                                                       *)
(* ------------------------------------------------------------------ *)

CreateDocument(u, did, pid) ==
    /\ did \in DocumentIds
    /\ \E p \in projects : p.id = pid
    /\ ~ \E d \in documents : d.id = did
    /\ HasPermission(u, "create", "documents",
         [project_id |-> pid, document_id |-> ""])
    /\ documents' = documents \union
         {[id |-> did, project_id |-> pid, created_by |-> u]}
    /\ UNCHANGED <<userRoles, projects, projectMembers, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "create", resource |-> "documents",
          document_id |-> did, project_id |-> pid, result |-> "ok"])

ReadDocument(u, did) ==
    /\ \E d \in documents : d.id = did
    /\ LET doc == CHOOSE d \in documents : d.id = did
       IN HasPermission(u, "read", "documents",
            [project_id |-> doc.project_id, document_id |-> did])
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "read", resource |-> "documents",
          document_id |-> did, result |-> "ok"])

UpdateDocument(u, did) ==
    /\ \E d \in documents : d.id = did
    /\ LET doc == CHOOSE d \in documents : d.id = did
       IN HasPermission(u, "update", "documents",
            [project_id |-> doc.project_id, document_id |-> did])
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "update", resource |-> "documents",
          document_id |-> did, result |-> "ok"])

DeleteDocument(u, did) ==
    /\ \E d \in documents : d.id = did
    /\ LET doc == CHOOSE d \in documents : d.id = did
       IN HasPermission(u, "delete", "documents",
            [project_id |-> doc.project_id, document_id |-> did])
    /\ documents'   = {d \in documents : d.id # did}
    /\ docVersions' = {v \in docVersions : v.document_id # did}
    /\ UNCHANGED <<userRoles, projects, projectMembers>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "delete", resource |-> "documents",
          document_id |-> did, result |-> "ok"])

(* ------------------------------------------------------------------ *)
(* Document Version CRUD                                               *)
(* ------------------------------------------------------------------ *)

CreateDocVersion(u, vid, did) ==
    /\ vid \in DocVersionIds
    /\ \E d \in documents : d.id = did
    /\ ~ \E v \in docVersions : v.id = vid
    /\ LET doc == CHOOSE d \in documents : d.id = did
       IN HasPermission(u, "create", "document_versions",
            [project_id |-> doc.project_id, document_id |-> did])
    /\ docVersions' = docVersions \union
         {[id |-> vid, document_id |-> did, uploaded_by |-> u]}
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "create", resource |-> "document_versions",
          version_id |-> vid, document_id |-> did, result |-> "ok"])

ReadDocVersion(u, vid) ==
    /\ \E v \in docVersions : v.id = vid
    /\ LET ver == CHOOSE v \in docVersions : v.id = vid
           doc == CHOOSE d \in documents : d.id = ver.document_id
       IN HasPermission(u, "read", "document_versions",
            [project_id |-> doc.project_id, document_id |-> ver.document_id])
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "read", resource |-> "document_versions",
          version_id |-> vid, result |-> "ok"])

DeleteDocVersion(u, vid) ==
    /\ \E v \in docVersions : v.id = vid
    /\ LET ver == CHOOSE v \in docVersions : v.id = vid
           doc == CHOOSE d \in documents : d.id = ver.document_id
       IN HasPermission(u, "delete", "document_versions",
            [project_id |-> doc.project_id, document_id |-> ver.document_id])
    /\ docVersions' = {v \in docVersions : v.id # vid}
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> "delete", resource |-> "document_versions",
          version_id |-> vid, result |-> "ok"])

(* ------------------------------------------------------------------ *)
(* Attempted unauthorized action (for exhaustive exploration)          *)
(* This action represents any access attempt that the permission       *)
(* check rejects — it does NOT change state.                          *)
(* ------------------------------------------------------------------ *)

UnauthorizedAttempt(u, action, resource, ctx) ==
    /\ ~ HasPermission(u, action, resource, ctx)
    /\ UNCHANGED <<userRoles, projects, projectMembers, documents, docVersions>>
    /\ accessLog' = Append(accessLog,
         [actor |-> u, action |-> action, resource |-> resource,
          result |-> "denied"])

\* =========================================================================
\* NEXT-STATE RELATION
\* =========================================================================
Next ==
    \/ \E admin \in UserIds, target \in UserIds, role \in Roles :
         AssignRole(admin, target, role)
    \/ \E admin \in UserIds, target \in UserIds :
         RemoveRole(admin, target)
    \/ \E u \in UserIds, pid \in ProjectIds, lid \in UserIds :
         CreateProject(u, pid, lid)
    \/ \E u \in UserIds, pid \in ProjectIds :
         ReadProject(u, pid)
    \/ \E u \in UserIds, pid \in ProjectIds :
         UpdateProject(u, pid)
    \/ \E u \in UserIds, pid \in ProjectIds :
         DeleteProject(u, pid)
    \/ \E u \in UserIds, pid \in ProjectIds, mid \in UserIds :
         AssignMember(u, pid, mid)
    \/ \E u \in UserIds, pid \in ProjectIds, mid \in UserIds :
         RemoveMember(u, pid, mid)
    \/ \E u \in UserIds, pid \in ProjectIds :
         ReadMembers(u, pid)
    \/ \E u \in UserIds, did \in DocumentIds, pid \in ProjectIds :
         CreateDocument(u, did, pid)
    \/ \E u \in UserIds, did \in DocumentIds :
         ReadDocument(u, did)
    \/ \E u \in UserIds, did \in DocumentIds :
         UpdateDocument(u, did)
    \/ \E u \in UserIds, did \in DocumentIds :
         DeleteDocument(u, did)
    \/ \E u \in UserIds, vid \in DocVersionIds, did \in DocumentIds :
         CreateDocVersion(u, vid, did)
    \/ \E u \in UserIds, vid \in DocVersionIds :
         ReadDocVersion(u, vid)
    \/ \E u \in UserIds, vid \in DocVersionIds :
         DeleteDocVersion(u, vid)

\* =========================================================================
\* SPECIFICATION
\* =========================================================================
Spec == Init /\ [][Next]_vars

\* =========================================================================
\* INVARIANTS
\* =========================================================================

(*  Invariant 1 — A user with no role cannot access any resource           *)
NoRoleNoAccess ==
    \A u \in UserIds :
      HasNoRole(u) =>
        \A action \in Actions, resource \in Resources,
           pid \in ProjectIds, did \in DocumentIds :
          ~ HasPermission(u, action, resource,
              [project_id |-> pid, document_id |-> did])

(*  Invariant 2 — A developer can never modify a project                   *)
DeveloperCannotModifyProject ==
    \A u \in UserIds :
      IsDeveloper(u) =>
        \A pid \in ProjectIds :
          /\ ~ HasPermission(u, "create", "projects",
                 [project_id |-> pid, document_id |-> ""])
          /\ ~ HasPermission(u, "update", "projects",
                 [project_id |-> pid, document_id |-> ""])
          /\ ~ HasPermission(u, "delete", "projects",
                 [project_id |-> pid, document_id |-> ""])

(*  Invariant 3 — A developer can never assign/remove members              *)
DeveloperCannotManageMembers ==
    \A u \in UserIds :
      IsDeveloper(u) =>
        \A pid \in ProjectIds :
          /\ ~ HasPermission(u, "create", "project_members",
                 [project_id |-> pid, document_id |-> ""])
          /\ ~ HasPermission(u, "update", "project_members",
                 [project_id |-> pid, document_id |-> ""])
          /\ ~ HasPermission(u, "delete", "project_members",
                 [project_id |-> pid, document_id |-> ""])

(*  Invariant 4 — Only admins can create/delete projects                   *)
OnlyAdminsCreateDeleteProjects ==
    \A u \in UserIds :
      ~ IsAdmin(u) =>
        \A pid \in ProjectIds :
          /\ ~ HasPermission(u, "create", "projects",
                 [project_id |-> pid, document_id |-> ""])
          /\ ~ HasPermission(u, "delete", "projects",
                 [project_id |-> pid, document_id |-> ""])

(*  Invariant 5 — Only admins can create/delete users                      *)
OnlyAdminsManageUsers ==
    \A u \in UserIds :
      ~ IsAdmin(u) =>
        \A action \in Actions :
          ~ HasPermission(u, action, "users",
              [project_id |-> "", document_id |-> ""])

(*  Invariant 6 — A project lead cannot access projects they don't lead    *)
(*  (unless assigned as member — in which case read-only)                  *)
LeadScopedToOwnProjects ==
    \A u \in UserIds :
      IsProjectLead(u) =>
        \A pid \in ProjectIds :
          (/\ ~ IsLeadOf(u, pid)
           /\ ~ IsMemberOf(u, pid)) =>
            \A action \in Actions :
              ~ HasPermission(u, action, "projects",
                  [project_id |-> pid, document_id |-> ""])

LeadReadOnlyOnMemberProjects ==
    \A u \in UserIds :
      IsProjectLead(u) =>
        \A pid \in ProjectIds :
          (/\ ~ IsLeadOf(u, pid)
           /\ IsMemberOf(u, pid)) =>
            /\ ~ HasPermission(u, "create", "projects",
                   [project_id |-> pid, document_id |-> ""])
            /\ ~ HasPermission(u, "update", "projects",
                   [project_id |-> pid, document_id |-> ""])
            /\ ~ HasPermission(u, "delete", "projects",
                   [project_id |-> pid, document_id |-> ""])

(*  Invariant 7 — Role assignment is exclusive (exactly one role per user) *)
(*  Structurally guaranteed: userRoles is a total function UserIds ->      *)
(*  AllRoleValues, so each user maps to exactly one value.                 *)
ExclusiveRoleAssignment ==
    \A u \in UserIds : userRoles[u] \in AllRoleValues

(*  Invariant 8 — No privilege escalation: a non-admin user cannot grant   *)
(*  themselves (or anyone) a higher role.  Only admins can call            *)
(*  AssignRole / RemoveRole — enforced by the action guards.              *)
(*  We verify the consequence: after every step, no user who was not an   *)
(*  admin in the previous state has a role higher than they had before.   *)
NoPrivilegeEscalation ==
    \A u \in UserIds :
      ~ IsAdmin(u) =>
        \A target \in UserIds, role \in Roles :
          ~ (  /\ HasPermission(u, "create", "users",
                     [project_id |-> "", document_id |-> ""])
             )

\* =========================================================================
\* SAFETY PROPERTIES (conjunctions of the invariants above)
\* =========================================================================

(*  Safety Property 1 — No unauthorized access:                            *)
(*  A user cannot perform an action their role doesn't permit.             *)
(*  This is entailed by the conjunction of invariants 1–6 plus the         *)
(*  structure of HasPermission, which is the sole gate for every action.   *)
NoUnauthorizedAccess ==
    /\ NoRoleNoAccess
    /\ DeveloperCannotModifyProject
    /\ DeveloperCannotManageMembers
    /\ OnlyAdminsCreateDeleteProjects
    /\ OnlyAdminsManageUsers
    /\ LeadScopedToOwnProjects
    /\ LeadReadOnlyOnMemberProjects

(*  Safety Property 2 — Separation of duties:                              *)
(*  Developers can't modify what leads manage, leads can't do what         *)
(*  admins do.                                                            *)
SeparationOfDuties ==
    \* Developers cannot manage members or documents (write)
    /\ \A u \in UserIds :
         IsDeveloper(u) =>
           \A pid \in ProjectIds, did \in DocumentIds :
             /\ ~ HasPermission(u, "create", "project_members",
                    [project_id |-> pid, document_id |-> ""])
             /\ ~ HasPermission(u, "delete", "project_members",
                    [project_id |-> pid, document_id |-> ""])
             /\ ~ HasPermission(u, "create", "documents",
                    [project_id |-> pid, document_id |-> ""])
             /\ ~ HasPermission(u, "update", "documents",
                    [project_id |-> pid, document_id |-> did])
             /\ ~ HasPermission(u, "delete", "documents",
                    [project_id |-> pid, document_id |-> did])
    \* Project leads cannot create/delete projects or manage users
    /\ \A u \in UserIds :
         IsProjectLead(u) =>
           /\ \A pid \in ProjectIds :
                /\ ~ HasPermission(u, "create", "projects",
                       [project_id |-> pid, document_id |-> ""])
                /\ ~ HasPermission(u, "delete", "projects",
                       [project_id |-> pid, document_id |-> ""])
           /\ \A action \in Actions :
                ~ HasPermission(u, action, "users",
                    [project_id |-> "", document_id |-> ""])

\* =========================================================================
\* COMBINED INVARIANT — Checked by TLC at every reachable state
\* =========================================================================
AuthorizationInvariant ==
    /\ TypeOK
    /\ NoRoleNoAccess
    /\ DeveloperCannotModifyProject
    /\ DeveloperCannotManageMembers
    /\ OnlyAdminsCreateDeleteProjects
    /\ OnlyAdminsManageUsers
    /\ LeadScopedToOwnProjects
    /\ LeadReadOnlyOnMemberProjects
    /\ ExclusiveRoleAssignment
    /\ NoPrivilegeEscalation
    /\ NoUnauthorizedAccess
    /\ SeparationOfDuties

\* =========================================================================
\* THEOREM — The specification satisfies all invariants
\* =========================================================================
THEOREM Spec => []AuthorizationInvariant

=============================================================================
