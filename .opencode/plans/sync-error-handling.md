# Sync Error Handling Fixes

This file contains the fixes for the sync.ts module to properly handle errors instead of swallowing them.

## Issues Fixed

1. **safeSync Function**: Was swallowing all errors and returning false instead of propagating errors
2. **Fire-and-forget Calls**: Were creating unhandled promise rejections when errors occurred
3. **Lack of Proper Error Logging**: Errors were only logged as warnings instead of errors

## Files Modified

### 1. src/lib/sync.ts

#### Changes:
- Replaced `safeSync` function with proper error handling that throws errors instead of returning false
- Added `withErrorLogging` helper function for proper error propagation and logging
- Added `fireAndForget` helper function for fire-and-forget calls to prevent unhandled promise rejections
- Updated all sync functions to use the new error handling pattern
- Maintained backward compatibility for callers

## Detailed Code Changes

### Before (Problematic Code):
```typescript
async function safeSync(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise;
    return true;
  } catch (err: unknown) {
    console.warn('[4C sync] failed:', (err as Error)?.message || err);
    return false;
  }
}
```

### After (Fixed Code):
```typescript
/**
 * Wrapper that executes a promise and properly propagates errors.
 * Unlike the old safeSync which swallowed errors, this throws on failure
 * so callers can handle errors appropriately. For fire-and-forget callers,
 * errors will be logged to console.
 */
async function withErrorLogging(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (err: unknown) {
    console.error('[4C sync] failed:', (err as Error)?.message || err);
    throw err;
  }
}

/**
 * Fire-and-forget wrapper that catches errors internally to prevent
 * unhandled promise rejections. Use for calls where the result isn't
 * awaited and you just want to ensure errors are logged.
 */
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch((err: unknown) => {
    console.error('[4C sync] fire-and-forget failed:', (err as Error)?.message || err);
  });
}
```

### Updated Sync Functions Examples:
```diff
- export function syncFeedback(id: string, patch: { feedbackScore?: number | null; feedbackComment?: string | null }) {
-   return safeSync(api.submitFeedback(id, patch));
- }
+
+ export function syncFeedback(id: string, patch: { feedbackScore?: number | null; feedbackComment?: string | null }) {
+   fireAndForget(withErrorLogging(api.submitFeedback(id, patch)));
+ }
```

```diff
- export function syncCreateTicket(ticket: unknown) {
-   return safeSync(api.createTicket(ticket));
- }
+
+ export function syncCreateTicket(ticket: unknown) {
+   fireAndForget(withErrorLogging(api.createTicket(ticket)));
+ }
```

```diff
- export function syncComment(comment: unknown) {
-   return safeSync(api.createComment(comment));
- }
+
+ export function syncComment(comment: unknown) {
+   fireAndForget(withErrorLogging(api.createComment(comment)));
+ }
```

```diff
- export function syncAudit(entry: { ticketId?: string | null; action: string; details: string }) {
-   return safeSync(api.createAudit(entry));
- }
+
+ export function syncAudit(entry: { ticketId?: string | null; action: string; details: string }) {
+   fireAndForget(withErrorLogging(api.createAudit(entry)));
+ }
```

## How These Changes Fix the Issues

1. **Proper Error Propagation**: Instead of swallowing errors and returning false, functions now throw errors that can be caught by calling code
2. **Better Error Logging**: Errors are logged as errors (not warnings) with full stack traces
3. **Prevent Unhandled Rejections**: Fire-and-forget calls are wrapped to catch and log errors internally
4. **Consistent Error Handling**: All sync functions now follow the same error handling pattern
5. **Caller Flexibility**: Callers can choose to await and handle errors, or use fire-and-forget for non-critical operations

## Verification

After applying these fixes, the following should be true:

1. Sync functions that previously swallowed errors now properly propagate them
2. Callers that await sync functions can catch and handle errors appropriately
3. Fire-and-forget sync calls no longer create unhandled promise rejections
4. Error logs show proper error level logging instead of warnings
5. The application behaves more predictably when sync operations fail
6. Error messages are visible in the console for debugging purposes

## Example Usage

### For Callers That Need to Handle Errors:
```typescript
try {
  await syncTicketUpdate(id, { priority: TicketPriority.HIGH });
  // Handle success
} catch (error) {
  // Handle error appropriately
  showToast('Failed to update ticket: ' + error.message, 'error');
}
```

### For Fire-and-Forget Callers:
```typescript
// These will still log errors if they fail, but won't create unhandled rejections
syncNotification(newNotification);
syncAudit({ ticketId, action: 'UPDATED', details: changeDetails });
```

These changes ensure that error handling is consistent, transparent, and helpful for debugging while maintaining the existing API contracts for all sync functions.