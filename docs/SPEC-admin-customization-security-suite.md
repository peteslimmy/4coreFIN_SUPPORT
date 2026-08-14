# Admin Customization & Security Suite — Specification

**Version:** 1.0
**Date:** 2026-07-24
**Status:** Draft

---

## Overview

This document specifies a comprehensive **Admin Customization & Security Suite** for the 4CoreFinSupport application. The suite adds white-label branding, theme management, integration configuration, authentication enhancements, and user profile settings — all backed by Supabase PostgreSQL and secured via role-based access control (RBAC).

**Architecture:** Frontend (React + Tailwind CSS) → Express API → Supabase PostgreSQL + Supabase Storage.

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Feature 1: Dynamic Branding & Image Uploads](#2-feature-1-dynamic-branding--image-uploads)
3. [Feature 2: White-Label & Theme Management](#3-feature-2-white-label--theme-management)
4. [Feature 3: Integrations — SMTP & External API Settings](#4-feature-3-integrations---smtp--external-api-settings)
5. [Feature 4: Authentication UI & Security Enhancements](#5-feature-4-authentication-ui--security-enhancements)
6. [Feature 5: Profile & Security Customization](#6-feature-5-profile--security-customization)
7. [API Endpoints](#7-api-endpoints)
8. [RBAC & Security](#8-rbac--security)
9. [File Structure](#9-file-structure)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Database Schema

### Table: `system_settings`

Key-value store for all application configuration. Replaces hardcoded defaults.

```sql
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
```

**Seed defaults:**

| Key | Default Value | Description |
|-----|---------------|-------------|
| `branding.logo_light` | `null` | Light mode logo URL |
| `branding.logo_dark` | `null` | Dark mode logo URL |
| `branding.favicon` | `null` | Favicon URL |
| `branding.hero_image` | `null` | Landing page hero image |
| `branding.feature_images` | `[]` | Array of feature image URLs |
| `branding.org_name` | `"4CoreFin"` | Organization display name |
| `theme.primary` | `"#2563eb"` | Primary color hex |
| `theme.secondary` | `"#64748b"` | Secondary color hex |
| `theme.accent` | `"#10b981"` | Accent color hex |
| `theme.mode` | `"system"` | `light` / `dark` / `system` |
| `theme.border_radius` | `"8px"` | `0px` / `6px` / `8px` / `12px` / `9999px` |
| `theme.font_family` | `"Plus Jakarta Sans"` | Primary font |
| `smtp.host` | `""` | SMTP server host |
| `smtp.port` | `""` | SMTP port |
| `smtp.security` | `"tls"` | `tls` / `ssl` / `none` |
| `smtp.username` | `""` | SMTP username |
| `smtp.password` | `""` | SMTP password (encrypted at rest) |
| `smtp.from_email` | `""` | Sender email address |
| `smtp.from_name` | `""` | Sender display name |
| `integrations.api_keys` | `[]` | Array of `{name, key, service}` objects |
| `integrations.webhooks` | `[]` | Array of `{name, url, events}` objects |
| `auth.session_timeout` | `43200` | Session timeout in seconds (12h default) |
| `auth.require_mfa` | `false` | Whether MFA is required |
| `auth.password_min_length` | `8` | Minimum password length |
| `auth.password_require_uppercase` | `true` | Require uppercase letter |
| `auth.password_require_number` | `true` | Require number |
| `auth.password_require_special` | `true` | Require special character |

### Table: `user_profiles`

Extended user profile data (supplements `users` table).

```sql
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url TEXT,
  display_name TEXT,
  title TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'Africa/Lagos',
  locale TEXT DEFAULT 'en-NG',
  notification_preferences JSONB DEFAULT '{"email": true, "push": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
```

### Supabase Storage Bucket

```
Bucket: branding-assets
Visibility: public (for logos/favicon served to clients)
File size limit: 5MB
Allowed types: image/png, image/jpeg, image/svg+xml, image/x-icon, image/webp
```

---

## 2. Feature 1: Dynamic Branding & Image Uploads

### 2.1 Upload Targets

| Target | Accept Types | Max Size | Container Style |
|--------|-------------|----------|-----------------|
| Organization Logo (Light) | PNG, SVG, WebP | 2MB | `max-h-10 w-auto object-contain` |
| Organization Logo (Dark) | PNG, SVG, WebP | 2MB | `max-h-10 w-auto object-contain` |
| Favicon | ICO, PNG, SVG | 500KB | Native `<link rel="icon">` |
| Landing Hero Image | PNG, JPEG, WebP | 5MB | `w-full h-auto object-cover` |
| Feature Images (×5) | PNG, JPEG, WebP | 3MB each | `w-full aspect-video object-cover` |

### 2.2 Upload Flow

```
Client → Express POST /api/admin/branding/upload
       → Validates file type + size
       → Uploads to Supabase Storage bucket 'branding-assets'
       → Returns public URL
       → Client saves URL to system_settings via PUT /api/admin/settings
```

### 2.3 Logo Auto-Fitting Logic

```css
/* Universal logo container — handles square, short-rect, wide-rect */
.logo-container {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 2.5rem;    /* 40px = h-10 */
  overflow: hidden;
}

.logo-container img {
  max-height: 100%;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
```

**Aspect ratio safety rules:**
- Never use `object-fit: cover` on logos (crops content)
- Container constrains height only; width is fluid
- SVG logos: preserve `viewBox`, scale proportionally
- Fallback: if no logo uploaded, render text-based org name

### 2.4 Real-Time Preview Frame

The admin panel includes a **Logo Preview Component** with:

```
┌─────────────────────────────────────────┐
│  Preview Mode: [Light] [Dark] [System]  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Light Background ────────────────┐  │
│  │  [Logo renders here]              │  │
│  │  Navbar simulation                │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ Dark Background ─────────────────┐  │
│  │  [Logo renders here]              │  │
│  │  Navbar simulation                │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Favicon Preview: [16px] [32px] [48px]  │
│                                         │
│  [Save Branding]                        │
└─────────────────────────────────────────┘
```

### 2.5 Favicon Dynamic Update

When a new favicon URL is saved:

```ts
function updateFavicon(url: string) {
  // Remove existing favicon links
  document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
  // Add new favicon
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = url;
  document.head.appendChild(link);
}
```

Called on app initialization and whenever `branding.favicon` setting changes.

---

## 3. Feature 2: White-Label & Theme Management

### 3.1 Theme Controls

| Control | Input Type | Values | Default |
|---------|-----------|--------|---------|
| Primary Color | Color picker + hex input | Any valid hex | `#2563eb` |
| Secondary Color | Color picker + hex input | Any valid hex | `#64748b` |
| Accent Color | Color picker + hex input | Any valid hex | `#10b981` |
| Dark Mode | Toggle: Light / Dark / System | 3 options | `system` |
| Border Radius | Segmented control | `0px`, `6px`, `8px`, `12px`, `9999px` | `8px` |
| Font Family | Dropdown | System fonts + Google Fonts | `Plus Jakarta Sans` |

### 3.2 CSS Variable Injection

Theme changes apply immediately via dynamic CSS variable injection:

```ts
function applyTheme(settings: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty('--primary', settings.primary);
  root.style.setProperty('--secondary', settings.secondary);
  root.style.setProperty('--accent', settings.accent);
  root.style.setProperty('--radius', settings.borderRadius);

  // Dark mode
  if (settings.mode === 'dark') {
    root.classList.add('dark');
  } else if (settings.mode === 'light') {
    root.classList.remove('dark');
  } else {
    // System preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}
```

### 3.3 Color Token Mapping

| CSS Variable | Tailwind Usage | Applies To |
|-------------|---------------|------------|
| `--primary` | `bg-primary`, `text-primary` | CTAs, active states, links |
| `--secondary` | `bg-secondary`, `text-secondary` | Secondary buttons, badges |
| `--accent` | `bg-accent`, `text-accent` | Highlights, notifications |
| `--radius` | `rounded-[var(--radius)]` | All rounded corners |

### 3.4 Implementation Pattern

```tsx
// In App.tsx or layout — read settings on mount
useEffect(() => {
  fetchSettings().then(settings => {
    applyTheme(settings.theme);
    if (settings.branding.favicon) updateFavicon(settings.branding.favicon);
  });
}, []);
```

---

## 4. Feature 3: Integrations — SMTP & External API Settings

### 4.1 SMTP Settings Form

**Fields:**

| Field | Type | Validation |
|-------|------|------------|
| Host | Text input | Required, valid hostname |
| Port | Number input | 1-65535, default 587 |
| Security | Toggle | TLS / SSL / None |
| Username | Text input | Required |
| Password | Password input | Required, masked |
| From Email | Email input | Valid email format |
| From Name | Text input | Required |

**Test Email Button:**
- Calls `POST /api/admin/smtp/test`
- Backend attempts SMTP connection with provided credentials
- Sends test email to current admin's email
- Returns success/failure with error details

### 4.2 API Keys & Webhooks Management

**API Keys Table:**

| Column | Type | Description |
|--------|------|-------------|
| Name | Text | Service name (e.g., "Stripe API Key") |
| Key | Masked text | API key (shown as `sk_live_••••••••••••••••`) |
| Service | Select | Stripe / PayPal / Adyen / Custom |
| Status | Badge | Active / Inactive |

**Security Controls:**
- Keys stored encrypted in database (AES-256-GCM)
- UI shows masked by default: `••••••••••••`
- Eye toggle reveals key (with audit log entry)
- Copy-to-clipboard button with toast confirmation
- Keys never returned in full via GET endpoint — only via explicit `/reveal` endpoint

**Webhooks Table:**

| Column | Type | Description |
|--------|------|-------------|
| Name | Text | Webhook identifier |
| URL | Text | Target URL |
| Events | Multi-select | `ticket.created`, `ticket.escalated`, `sla.breach`, etc. |
| Status | Badge | Active / Inactive |
| Last Fired | Timestamp | Last trigger time |

---

## 5. Feature 4: Authentication UI & Security Enhancements

### 5.1 Enhanced Login Form

**New fields:**
- `remember_me` checkbox — persists JWT for 30 days (vs. default 12h)
- `forgot_password` link → `/auth/forgot-password`

**Remember Me Logic:**
```ts
// If remember_me is checked, extend token TTL
const tokenTTL = rememberMe ? '30d' : '12h';
const token = jwt.sign(payload, SECRET, { expiresIn: tokenTTL });

// Client stores in localStorage (remember) vs sessionStorage (session only)
if (rememberMe) {
  localStorage.setItem('auth_token', token);
} else {
  sessionStorage.setItem('auth_token', token);
}
```

### 5.2 Forgot Password Workflow

```
/auth/forgot-password → Enter email → POST /api/auth/forgot-password
                                      → Sends reset link via SMTP
/auth/reset-password?token=xxx → Enter new password → POST /api/auth/reset-password
                                      → Validates token + updates password_hash
```

**Reset token:** JWT with 1-hour expiry, containing `{userId, purpose: 'password_reset'}`.

### 5.3 Strong Password Validation Component

**Real-time strength meter with 4 criteria:**

| Criterion | Regex | Weight |
|-----------|-------|--------|
| 8+ characters | `/.{8,}/` | 25% |
| Uppercase + Lowercase | `/[a-z]/` and `/[A-Z]/` | 25% |
| At least one number | `/[0-9]/` | 25% |
| Special character | `/[!@#$%^&*(),.?":{}|<>]/` | 25% |

**Visual indicator:**
```
Password: [________________]
Strength: [████░░░░░░] 40%
✓ 8+ characters
✓ Uppercase & lowercase
✗ Number required
✗ Special character required

[Create Account] ← disabled until 100%
```

**Color mapping:** 0-25% red, 25-50% amber, 50-75% yellow, 75-100% green.

### 5.4 Auth Page Branding

Login/register pages display the custom logo:
- Fetched from `system_settings` on page load
- Uses the auto-fitting logo container from Feature 1
- Falls back to text-based org name if no logo

```tsx
function AuthLogo() {
  const { settings } = useSettings();
  if (settings?.branding?.logo_light) {
    return <img src={settings.branding.logo_light} alt="Logo" className="max-h-10 w-auto object-contain" />;
  }
  return <span className="text-xl font-bold">{settings?.branding?.org_name || '4CoreFin'}</span>;
}
```

---

## 6. Feature 5: Profile & Security Customization

### 6.1 Profile Settings Page (`/profile/settings`)

**Layout:**
```
┌─────────────────────────────────────────┐
│  Profile Settings                       │
├──────────┬──────────────────────────────┤
│ Sidebar  │  Content Area                │
│          │                              │
│ Profile  │  [Avatar Upload + Preview]   │
│ Security │  Display Name: [__________]  │
│ Prefs    │  Email: [__________]         │
│          │  Title: [__________]         │
│          │  Bio: [__________]           │
│          │  Timezone: [dropdown]        │
│          │  [Save Changes]              │
└──────────┴──────────────────────────────┘
```

### 6.2 Avatar Upload with Crop/Circle Preview

**Upload flow:**
1. User selects image file
2. Image displays in circular crop preview (120px diameter)
3. Optional: drag-to-reposition before upload
4. Upload to Supabase Storage bucket `user-avatars`
5. Save URL to `user_profiles.avatar_url`

**Display logic:**
```tsx
function UserAvatar({ url, name, size = 'md' }) {
  const sizes = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-16 h-16', xl: 'w-24 h-24' };
  if (url) {
    return <img src={url} alt={name} className={`${sizes[size]} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-brand-600 flex items-center justify-center text-white font-bold`}>
      {name.split(' ').map(n => n[0]).join('').slice(0, 2)}
    </div>
  );
}
```

### 6.3 Security Tab — Change Password

**Form fields:**
| Field | Type | Validation |
|-------|------|------------|
| Current Password | Password input | Required, verified against hash |
| New Password | Password input | Strong password rules apply |
| Confirm Password | Password input | Must match new password |

**Flow:**
1. User enters current password
2. Frontend sends `POST /api/auth/verify-password` to check current password
3. If valid, enable new password fields
4. On submit, `POST /api/auth/change-password` with `{currentPassword, newPassword}`
5. Backend verifies current, updates hash, invalidates existing tokens

---

## 7. API Endpoints

### Admin Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/settings` | Admin | Get all system settings |
| `PUT` | `/api/admin/settings/:key` | Admin | Update a setting |
| `PUT` | `/api/admin/settings` | Admin | Bulk update settings |
| `POST` | `/api/admin/branding/upload` | Admin | Upload branding asset |
| `POST` | `/api/admin/smtp/test` | Admin | Send test email |
| `POST` | `/api/admin/api-keys` | Admin | Create API key |
| `DELETE` | `/api/admin/api-keys/:id` | Admin | Delete API key |
| `POST` | `/api/admin/api-keys/:id/reveal` | Admin | Reveal masked key |
| `POST` | `/api/admin/webhooks` | Admin | Create webhook |
| `DELETE` | `/api/admin/webhooks/:id` | Admin | Delete webhook |
| `POST` | `/api/admin/webhooks/:id/test` | Admin | Send test webhook *(planned — not yet implemented)* |

### User Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/profile` | Any | Get current user profile |
| `PUT` | `/api/profile` | Any | Update profile fields |
| `POST` | `/api/profile/avatar` | Any | Upload avatar |
| `POST` | `/api/auth/forgot-password` | Public | Request password reset |
| `POST` | `/api/auth/reset-password` | Public | Reset password with token |
| `POST` | `/api/auth/verify-password` | Any | Verify current password |
| `POST` | `/api/auth/change-password` | Any | Change password |

### Public (Settings for branding on login page)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/public/settings` | None | Get public branding settings (logo, favicon, org name) |

---

## 8. RBAC & Security

### Role Checks

```ts
// Middleware: requireAdmin
function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Frontend route guard
function AdminRoute({ children }) {
  const { currentRole } = useApp();
  if (currentRole !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
```

### Security Rules

1. **SMTP password** stored encrypted (AES-256-GCM) in database, decrypted only when sending
2. **API keys** stored encrypted, never returned in full via GET — only via explicit reveal endpoint with audit log
3. **Logo/favicon uploads** validated for file type and size before storage
4. **Password reset tokens** expire after 1 hour, single-use
5. **Session timeout** configurable via settings (default 12h)
6. **All admin endpoints** require `SUPER_ADMIN` role
7. **Profile endpoints** require authentication, users can only modify their own profile
8. **Public settings endpoint** only returns branding display fields (logo, org name) — no sensitive config

### Audit Trail

All admin setting changes logged to `audit_logs`:
- `ADMIN_SETTING_UPDATED` — with key name and old/new value
- `ADMIN_BRANDING_UPLOAD` — with file name and URL
- `ADMIN_API_KEY_CREATED` / `ADMIN_API_KEY_DELETED`
- `ADMIN_SMTP_TEST` — with success/failure
- `USER_PASSWORD_CHANGED` — with user ID
- `USER_PROFILE_UPDATED` — with changed fields

---

## 9. File Structure

```
server/
├── routes/
│   ├── adminSettings.ts      # Admin settings CRUD endpoints
│   ├── adminBranding.ts      # Branding upload endpoints
│   ├── profile.ts            # User profile endpoints
│   └── authEnhanced.ts       # Forgot/reset/change password
├── middleware/
│   └── requireAdmin.ts       # Admin RBAC middleware
├── services/
│   ├── settingsService.ts    # Settings read/write logic
│   ├── storageService.ts     # Supabase Storage upload helpers
│   ├── smtpService.ts        # SMTP connection + send
│   └── encryptionService.ts  # AES-256-GCM encrypt/decrypt
└── supabase.ts               # Existing Supabase client

src/
├── components/
│   ├── admin/
│   │   ├── BrandingSettings.tsx     # Logo upload + preview
│   │   ├── ThemeSettings.tsx        # Color pickers + mode toggle
│   │   ├── IntegrationSettings.tsx  # SMTP + API keys + webhooks
│   │   ├── SettingsLayout.tsx       # Admin settings page layout
│   │   └── PasswordStrengthMeter.tsx # Reusable strength indicator
│   ├── auth/
│   │   ├── ForgotPasswordForm.tsx
│   │   ├── ResetPasswordForm.tsx
│   │   └── AuthLogo.tsx            # Dynamic logo on auth pages
│   ├── profile/
│   │   ├── ProfileSettings.tsx
│   │   ├── AvatarUpload.tsx
│   │   └── ChangePasswordModal.tsx
│   └── ui/
│       ├── ColorPicker.tsx          # Hex + visual picker
│       ├── MaskedInput.tsx          # Password-style reveal toggle
│       └── FileUpload.tsx           # Drag-drop upload component
├── hooks/
│   ├── useSettings.ts              # Fetch + cache system settings
│   └── useTheme.ts                 # Apply theme CSS variables
├── pages/
│   ├── AdminSettingsPage.tsx        # /admin/settings
│   ├── ProfileSettingsPage.tsx      # /profile/settings
│   ├── ForgotPasswordPage.tsx       # /auth/forgot-password
│   └── ResetPasswordPage.tsx        # /auth/reset-password
└── lib/
    └── theme.ts                     # Theme application utilities
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Days 1-2)
- Create `system_settings` and `user_profiles` tables
- Create `branding-assets` storage bucket
- Build `settingsService.ts` and `encryptionService.ts`
- Add `requireAdmin` middleware
- Build `GET /api/public/settings` endpoint
- Build `useSettings` hook with caching

### Phase 2: Branding & Theme (Days 3-4)
- Build `BrandingSettings.tsx` with upload + preview
- Build `ThemeSettings.tsx` with color pickers + CSS injection
- Build `ColorPicker.tsx` and `FileUpload.tsx` UI components
- Implement favicon dynamic update
- Apply theme on app mount via `useTheme` hook

### Phase 3: Integrations (Days 5-6)
- Build `IntegrationSettings.tsx` with SMTP form
- Build `MaskedInput.tsx` component
- Implement `smtpService.ts` with test email
- Implement API key encrypt/decrypt + reveal endpoint
- Build webhook management UI

### Phase 4: Auth Enhancements (Days 7-8)
- Build `PasswordStrengthMeter.tsx`
- Add `remember_me` to login flow
- Build `/auth/forgot-password` and `/auth/reset-password` pages
- Add `PasswordStrengthMeter` to register + reset forms
- Display custom logo on auth pages via `AuthLogo`

### Phase 5: Profile & Polish (Days 9-10)
- Build `ProfileSettingsPage.tsx` with tabs
- Build `AvatarUpload.tsx` with circular preview
- Build `ChangePasswordModal.tsx`
- Add audit logging for all admin actions
- Final RBAC testing across all endpoints

---

## Appendix: Environment Variables

```env
# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# SMTP (fallback if not configured in settings)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Encryption key for API keys / SMTP passwords (32-byte hex)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```
