# PixelForge Nexus — Test Credentials

## Login URL
http://localhost:3000/login

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@pixelforge.dev | Admin@2024!Secure |
| **Project Lead** | lead@pixelforge.dev | Lead@2024!Secure |
| **Developer** | dev@pixelforge.dev | Dev@2024!Secure |

## Role Capabilities

### Admin (admin@pixelforge.dev)
- Full access to all features
- Create/edit/delete projects
- Mark projects as completed
- Create and manage user accounts
- Assign/change user roles
- Upload documents to any project
- Assign project leads

### Project Lead (lead@pixelforge.dev)
- View projects they lead
- Assign developers to their projects
- Upload documents to their projects
- View team members

### Developer (dev@pixelforge.dev)
- View projects they are assigned to
- Access and download project documents
- View team members on their projects

## MFA (Multi-Factor Authentication)
- Any user can enable TOTP MFA in Settings
- Uses Google Authenticator / Authy / any TOTP app
- When enabled, a 6-digit code is required after password login

## Sample Data
- **Dragon's Quest RPG** — Active project led by Lisa Lead with David Developer assigned
- **Pixel Racers** — Active project led by Lisa Lead

## Security Notes
- Passwords are hashed with bcrypt (handled by Supabase Auth)
- Row Level Security (RLS) enforced at database level
- JWT-based session management with automatic token refresh
- No self-registration — only admins can create accounts
- Service role key is server-side only (never exposed to client)
