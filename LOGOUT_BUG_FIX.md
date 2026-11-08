# Logout Button Bug Fix

## Problem
When clicking the Logout button, the login modal appeared briefly and then returned to the dashboard instead of actually logging out.

## Root Cause
The authentication system had a critical race condition:

1. **`Auth.user()` was synchronous** but `Api.currentUser()` is **async**
2. In `login.js`, the check `if (Auth.user())` returned immediately (before the async call completed), so it always returned undefined
3. When logout ran and redirected to login.html, the page loaded but `Auth.currentUser()` hadn't completed yet
4. The old session cookie was still valid, so the user was re-authenticated
5. The navbar rendered with the user still logged in

### Example of the Bug

```javascript
// OLD CODE - BROKEN
const Auth = {
  user() {
    return Api.currentUser();  // ❌ Returns Promise, not user
  },

  logout() {
    Api.logout().then(() => {
      window.location.href = "login.html";  // Redirects before async completes
    });
  }
};

// In login.js:
if (Auth.user()) {  // ❌ Always false (Promise is truthy but not a user object)
  window.location.href = "dashboard.html";
}
```

## Solution
Made all auth functions **async** and **properly await** them:

```javascript
// NEW CODE - FIXED
const Auth = {
  async currentUser() {
    return await Api.currentUser();  // ✅ Returns user object
  },

  async logout() {
    try {
      await Api.logout();  // ✅ Wait for server to clear session
    } catch (e) {
      console.error("Logout error:", e);
    }
    window.location.href = "login.html";  // ✅ Redirect after logout completes
  }
};

// In login.js:
Auth.currentUser().then(user => {
  if (user) {  // ✅ Wait for result before checking
    window.location.href = "dashboard.html";
  }
});
```

## Files Changed

### Core auth logic
- **`app/js/auth.js`**
  - `currentUser()` → `async currentUser()`
  - `isAdmin()` → `async isAdmin()`
  - `requireAuth()` → `async requireAuth()`
  - `requireAdmin()` → `async requireAdmin()`
  - `logout()` → `async logout()` with proper await
  - All methods now properly await `Api.currentUser()`

### Page initialization (now async)
- **`app/js/pages/login.js`** — Await `Auth.currentUser()` before checking redirect
- **`app/js/pages/dashboard.js`** — `$(async function)` with `await Auth.requireAuth()`
- **`app/js/pages/job-detail.js`** — `$(async function)` with `await Auth.requireAuth()`
- **`app/js/pages/job-create.js`** — `$(async function)` with `await Auth.requireAdmin()`
- **`app/js/pages/admin-settings.js`** — `$(async function)` with `await Auth.requireAdmin()`
- **`app/js/pages/report.js`** — `$(async function)` with `await Auth.requireAuth()`

### UI rendering
- **`app/js/common.js`** — `renderNavbar()` now awaits `Auth.currentUser()` before rendering navbar

## How It Works Now

### Logout Flow (Fixed)
1. User clicks "Logout" button
2. `Auth.logout()` is called
3. Waits for `Api.logout()` to complete (server clears session via `session.destroy()`)
4. Server responds with `{ ok: true }`
5. Frontend redirects to `login.html`
6. Login page loads and checks `Auth.currentUser()`
7. Backend returns `null` (session was destroyed)
8. Page stays on login.html ✅

### Login → Dashboard Flow (Fixed)
1. User visits `login.html` (already logged in via browser cookies)
2. Page script: `await Auth.currentUser()` → returns user object
3. Redirect to `dashboard.html`
4. Dashboard awaits `Auth.requireAuth()`
5. User is authenticated ✅
6. Navbar renders with username and logout button ✅

### Page Protection (Fixed)
1. Unauthenticated user visits `dashboard.html`
2. Script: `await Auth.requireAuth()` → calls `Api.currentUser()`
3. Backend returns `null` (no session)
4. Redirect to `login.html` ✅
5. Page never renders for unauthorized users ✅

## Testing the Fix

### Test Case 1: Logout Clears Session
1. Log in with `admin@xtera.co.nz` / `admin123`
2. Verify you're on dashboard
3. Click logout button
4. Verify login page loads and stays on login page
5. Verify username/role don't appear in navbar
6. Refresh page — stays on login (session is cleared)

### Test Case 2: Login Redirects to Dashboard
1. Visit `login.html` while already logged in
2. Page should immediately redirect to `dashboard.html`
3. Navbar should render with username

### Test Case 3: Dashboard Requires Auth
1. Clear browser cookies (or use incognito)
2. Visit `dashboard.html` directly
3. Should redirect to `login.html`

### Test Case 4: Admin Pages Require Admin Role
1. Log in with `staff@xtera.co.nz` / `staff123` (staff role)
2. Visit `job-create.html` directly
3. Should redirect to `dashboard.html`
4. Log in with `admin@xtera.co.nz` / `admin123`
5. Now `job-create.html` should load

## Migration Notes

All page initialization functions are now `async`:
```javascript
// OLD: $(function () { ... })
// NEW: $(async function () { ... })
```

This is safe because:
- jQuery's `$(async function)` still fires when DOM is ready
- The function is async, so it doesn't block rendering
- Auth checks happen after DOM is ready
- If auth fails, redirects happen before other code runs
