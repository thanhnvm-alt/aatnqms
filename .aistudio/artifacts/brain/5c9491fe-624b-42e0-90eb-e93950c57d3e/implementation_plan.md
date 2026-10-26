# Implementation Plan - Password Management & Recovery (First Login Change & Forgot Password)

## User Requirements
1. **First-time password change**: When new users log in with default credentials or when required, display a notification modal prompting them to change their password immediately.
2. **Forgot Password recovery**: Allow users to recover/reset their password using their registered email address and set a new password.

## Proposed Changes

### Backend (`server.ts` & `services/dbService.ts`)
1. **Change Password Endpoint (`POST /api/auth/change-password`)**:
   - Authenticates current password (or allows forced change if `require_password_change` is true).
   - Updates password (hashed with bcrypt) and sets `require_password_change = false`.
   - Logs audit trail.

2. **Forgot Password Request Endpoint (`POST /api/auth/forgot-password`)**:
   - Accepts `email`.
   - Checks if user exists. Generates a secure reset token / code (e.g. valid for 15 minutes).
   - Simulates sending email (and returns the reset code/token in development response for testing ease).

3. **Reset Password Endpoint (`POST /api/auth/reset-password`)**:
   - Accepts `email`, `code`, and `newPassword`.
   - Verifies code and updates password with bcrypt hash.

### Frontend (`src/components/LoginPage.tsx`)
1. **First Login Modal**:
   - Detects `requirePasswordChange: true` upon login.
   - Prompts user to change password immediately.

2. **Forgot Password Modal**:
   - Step 1: Input email.
   - Step 2: Input reset code and new password.
