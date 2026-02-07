# PixelForge Nexus — Secure Design and Development Report

**Module**: Secure Design and Development  
**Student**: Creative SkillZ LLC — PixelForge Nexus Project  
**System**: Online Project Management System for Game Development  
**Technology Stack**: Next.js 16, TypeScript, Supabase (PostgreSQL + Auth + Storage), Tailwind CSS

---

## 1. System Design (35%)

### 1.1 Design Principles and Architecture

PixelForge Nexus follows a layered security architecture built on three foundational design principles: **defence in depth**, **least privilege**, and **separation of concerns**.

**Defence in Depth** is implemented through four concentric security layers. The outermost layer is the Next.js middleware (`middleware.ts`), which intercepts every request, validates the user's JWT via `supabase.auth.getUser()` (which performs a server-side verification rather than trusting the client-side session), and enforces Multi-Factor Authentication (MFA) status by checking the Authenticator Assurance Level (AAL). The second layer comprises Server Actions (`src/actions/`), which re-validate the user's identity and role before executing any business logic. For example, `createUser()` in `users.ts` explicitly queries the `user_roles` table to verify the caller holds the `admin` role before proceeding. The third layer is PostgreSQL Row Level Security (RLS), enforced at the database level, which ensures that even if an attacker bypasses the application layer, the database itself rejects unauthorised queries. The fourth layer is Supabase Storage RLS policies, which independently gate file upload and download operations by role.

**Least Privilege** is enforced through the role-based access control (RBAC) model. Three roles exist — `admin`, `project_lead`, and `developer` — each with progressively restricted permissions. Developers can only read projects they are explicitly assigned to and cannot create, update, or delete any resources. Project leads can manage team members and documents only within projects they lead. Admins have full access but are the only role permitted to create or delete users, projects, and manage roles. The system uses the Supabase `anon` key for client-side operations (which is restricted by RLS) and the `service_role` key exclusively in server-side admin operations that require elevated privileges, ensuring the service key is never exposed to the browser.

**Separation of Concerns** manifests in the architectural boundary between authentication (handled entirely by Supabase Auth), authorisation (enforced by RLS policies and server action guards), data access (PostgreSQL with RLS), and file storage (Supabase Storage with its own policies). Each layer operates independently — a change to the UI does not affect database security, and a new RLS policy does not require application code changes.

### 1.2 Security Principles in Practice

The authentication flow implements a **state machine model** with clearly defined transitions (documented in `formal-methods/auth-state-machine.md`). Users begin in an `Unauthenticated` state, transition to `AAL1` upon successful password authentication, and optionally advance to `AAL2` by verifying a TOTP code. The middleware enforces that users with enrolled MFA factors must complete verification before accessing any protected route, preventing session hijacking from bypassing the second factor.

**Input validation** follows a dual-layer strategy using Zod schemas (`src/lib/validations.ts`). Every form submission is validated on the client side for user experience, then re-validated on the server side within Server Actions before any database operation. Password schemas enforce minimum 8 characters with mandatory uppercase, lowercase, numeric, and special character requirements. Project deadlines are validated to be future dates. UUID parameters are schema-checked to prevent injection of malformed identifiers.

**No self-registration** is permitted. Only administrators can create user accounts via the `supabase.auth.admin.createUser()` API using the service role key. This eliminates an entire class of vulnerabilities related to open registration (spam accounts, enumeration attacks, mass account creation).

### 1.3 OWASP Top 10 Considerations

The design addresses several OWASP Top 10 (2021) categories:

**A01: Broken Access Control** — Mitigated through four-layer defence: middleware authentication, server action role checks, RLS policies, and storage policies. RLS policies use `SECURITY DEFINER` helper functions (`get_my_project_ids()`, `get_my_led_project_ids()`, `get_my_led_document_ids()`) to safely resolve cross-table membership checks without infinite recursion, while still enforcing row-level access. Every `FOR ALL` policy includes both `USING` and `WITH CHECK` clauses.

**A02: Cryptographic Failures** — Passwords are hashed by Supabase Auth using bcrypt. JWTs are signed with ES256 (ECDSA with P-256 and SHA-256). All communication occurs over HTTPS. Sensitive keys (service role key) are stored in `.env.local` and never committed to version control. Document download URLs are time-limited signed URLs with 1-hour expiry.

**A03: Injection** — SQL injection is prevented by Supabase's parameterised query builder (`.from().select().eq()` pattern), which never interpolates raw strings into SQL. All user inputs are validated through Zod schemas before reaching any database operation. The Zod schema for email uses `z.string().email()`, UUIDs use `z.string().uuid()`, and free-text fields have bounded lengths.

**A04: Insecure Design** — The system was designed with security as a primary requirement, not bolted on afterward. The TLA+ specification (`formal-methods/authorization-model.tla`) formally models the RBAC invariants, including proofs that developers cannot escalate privileges, leads cannot access unrelated projects, and no user without a role can access any resource.

**A07: Identification and Authentication Failures** — Mitigated through strong password policies (Zod-enforced complexity), TOTP-based MFA, JWT validation on every request via `getUser()` (not `getSession()`, which only checks the local token without server verification), and automatic session refresh in middleware.

---

## 2. Security Testing and Analysis (35%)

### 2.1 Testing Methodology

Security testing was conducted across three dimensions: **API-level access control testing**, **RLS policy verification**, and **input validation testing**.

**API-Level Testing**: Each of the three user roles (admin, project lead, developer) was tested against every API endpoint by authenticating via `supabase.auth.signInWithPassword()` and issuing direct REST API calls with the resulting JWT. This verified that the Custom Access Token Hook correctly injects `user_role` into the JWT claims, and that RLS policies correctly evaluate these claims.

**RLS Policy Verification**: Direct REST API queries were issued against the Supabase PostgREST API to confirm:
- Admin tokens return all projects (2/2 in test data).
- Project lead tokens return only projects where `lead_id` matches (2/2, as the test lead leads both projects).
- Developer tokens return only projects where the user is in `project_members` (1/2, only Dragon's Quest RPG).
- An unauthenticated request (no token) returns zero rows or an authentication error.

**Input Validation Testing**: Server Actions were tested with invalid inputs — empty strings, strings exceeding length limits, malformed UUIDs, passwords missing required character classes — to confirm Zod schemas reject them before any database operation occurs.

### 2.2 Vulnerabilities Found and Mitigated

**V1: Infinite RLS Recursion** — The initial RLS policy design caused `ERROR: 42P17: infinite recursion detected in policy for relation "projects"`. The `projects` table's developer policy queried `project_members`, whose lead policy queried back into `projects`, creating an infinite loop. This was mitigated by introducing three `SECURITY DEFINER` helper functions (`get_my_project_ids()`, `get_my_led_project_ids()`, `get_my_led_document_ids()`) that bypass RLS internally, breaking the circular reference chain while maintaining the same access control semantics. This is documented in `supabase/migrations/002_fix_rls_recursion.sql`.

**V2: Missing Profile Backfill** — Users created before the `handle_new_user()` trigger was installed had no entries in the `profiles` table, causing application errors when the dashboard tried to display user names. This was mitigated by adding a backfill query at the end of the migration that inserts profiles for any `auth.users` rows not already in `profiles`.

**V3: Self-Deletion Prevention** — The `deleteUser()` action initially lacked a check preventing an admin from deleting their own account, which would have resulted in an orphaned session and broken state. A guard was added: `if (userId === user.id) return { error: 'You cannot delete your own account' }`.

**V4: Storage Cleanup on Upload Failure** — If file upload to Supabase Storage failed after the `documents` record was already created, the system would leave an orphaned database record. The `uploadDocument()` action now performs cleanup by deleting the document record if the storage upload fails: `await supabase.from('documents').delete().eq('id', doc.id)`.

**V5: Session Validation Method** — The middleware uses `supabase.auth.getUser()` instead of `supabase.auth.getSession()`. The `getUser()` method makes a server-side call to Supabase Auth to verify the JWT's validity, while `getSession()` merely checks the token locally and is susceptible to using revoked or expired tokens. This is a critical security distinction documented by Supabase themselves.

### 2.3 Access Control Matrix Verification

| Resource | Admin | Project Lead (own) | Project Lead (other) | Developer (assigned) | Developer (unassigned) | No Role |
|----------|-------|-------------------|---------------------|---------------------|----------------------|---------|
| Projects | CRUD | RU | R (if member) | R | None | None |
| Members | CRUD | CRUD | None | R | None | None |
| Documents | CRUD | CRUD | None | R | None | None |
| Doc Versions | CRUD | CRUD | None | R | None | None |
| Users | CRUD | None | None | None | None | None |

All cells in this matrix were verified through direct API testing with appropriate JWT tokens.

---

## 3. System Development (20%)

### 3.1 Legal and Ethical Context

The system processes personal data (email addresses, full names, user activity) and therefore falls under the **UK General Data Protection Regulation (UK GDPR)** and the **Data Protection Act 2018**. Key compliance measures include:

**Article 5 — Data Minimisation**: The system collects only the minimum data required: email, full name, and role. No unnecessary personal data is stored. Avatar URLs are optional.

**Article 25 — Data Protection by Design and Default**: Security was built into the architecture from the outset, not added retrospectively. RLS ensures that users can only access data they are authorised to see by default. New users have the `developer` role (least privilege) unless explicitly promoted by an admin.

**Article 32 — Security of Processing**: The system implements appropriate technical measures including encryption in transit (HTTPS/TLS), encryption at rest (Supabase encrypts PostgreSQL data at rest), access controls (RBAC with RLS), and multi-factor authentication. Passwords are hashed using bcrypt, and JWTs are signed with ES256.

**Article 17 — Right to Erasure**: The `deleteUser()` function deletes the user from `auth.users`, which cascades to `profiles`, `user_roles`, `project_members`, and related records via `ON DELETE CASCADE` foreign keys, ensuring complete data removal.

### 3.2 Secure Development Standards

The project follows several secure development practices:

**TypeScript Strict Mode**: The `tsconfig.json` enables `strict: true`, which enforces null safety, strict property checks, and type-safe function parameters, eliminating an entire class of runtime errors.

**Server Actions for Sensitive Operations**: All data mutations run as Next.js Server Actions marked with `'use server'`, ensuring that business logic and database credentials never reach the client. The service role key is only used in `src/lib/supabase/admin.ts`, which is exclusively imported by server-side code.

**Environment Variable Isolation**: Secrets are stored in `.env.local` (gitignored). Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to the client, as designed by Supabase's security model. The `SUPABASE_SERVICE_ROLE_KEY` is only accessible in server-side contexts.

**Dependency Security**: The project uses well-maintained, widely audited dependencies (Next.js, Supabase, Zod, React Hook Form) with no known critical vulnerabilities. The `package-lock.json` ensures reproducible builds with pinned dependency versions.

---

## 4. Formal Methods (10%)

### 4.1 State Machine Models

Three finite state machines were developed to formally model the system's critical flows:

**Authentication State Machine** (`formal-methods/auth-state-machine.md`): Models 6 states including `Unauthenticated`, `AAL1_NoMFA`, `AAL1_MFA_Required`, `AAL2_Verified`, plus the MFA enrollment sub-state machine and the middleware decision tree. All transitions are labelled with events and guard conditions mapped to actual Supabase API calls. The model verifies that no path exists from `Unauthenticated` to any protected state without passing through password verification, and that enrolled MFA cannot be bypassed.

**Project Lifecycle State Machine** (`formal-methods/project-lifecycle-state-machine.md`): Models the project lifecycle from creation through active, completed, and deleted states. Composite states model team assignment and lead management as concurrent sub-state machines within the active state. Guard conditions specify role requirements on every transition.

**Document Versioning State Machine** (`formal-methods/document-versioning-state-machine.md`): Models the document lifecycle from creation through versioning to deletion. Composite states detail the upload flow including validation, storage upload, version record creation, and atomic version increment via the `create_document_version` RPC. Rollback states model the cleanup behaviour when storage upload fails.

### 4.2 TLA+ Specification

The TLA+ specification (`formal-methods/authorization-model.tla`) formally models the complete RBAC authorization system across 623 lines. It defines the state space (users, roles, projects, members, documents, versions), 17 possible actions, and a central `HasPermission(u, action, resource, ctx)` predicate that encodes the entire permission matrix derived from the actual RLS policies.

Eight invariants are specified and verified:
1. **NoRoleNoAccess** — users without roles cannot access any resource
2. **DeveloperCannotModifyProject** — developers cannot create, update, or delete projects
3. **DeveloperCannotManageMembers** — developers cannot assign or remove members
4. **OnlyAdminsCreateDeleteProjects** — project creation/deletion is admin-exclusive
5. **OnlyAdminsManageUsers** — user/role management is admin-exclusive
6. **LeadScopedToOwnProjects** — leads can only modify projects they lead
7. **ExclusiveRoleAssignment** — each user has exactly one role
8. **NoPrivilegeEscalation** — non-admins cannot grant themselves higher roles

Two composite safety properties are defined: `NoUnauthorizedAccess` (conjunction of invariants 1–6) and `SeparationOfDuties` (developers cannot perform lead actions, leads cannot perform admin actions). These properties map directly to the system's RLS policies and server action guards, providing formal assurance that the implementation satisfies the security specification.

---

## 5. Conclusion

PixelForge Nexus demonstrates that security can be deeply integrated into a modern web application without sacrificing developer experience or usability. The four-layer defence model (middleware → server actions → RLS → storage policies), combined with formal verification through TLA+ and state machine analysis, provides robust protection against the OWASP Top 10 threat categories while maintaining compliance with UK GDPR requirements. The discovery and resolution of the RLS recursion vulnerability during testing illustrates the value of thorough security testing beyond static code analysis.

---

**Word Count**: ~2,050  
**References**: OWASP Top 10 (2021), UK GDPR, Supabase Security Documentation, TLA+ Specification Language
