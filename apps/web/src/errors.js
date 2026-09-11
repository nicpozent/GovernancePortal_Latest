/* ============================================================
   Map the API's stable machine error codes (the `error` field) to friendly,
   user-facing messages. Keep in sync with the catalogue in
   docs/TROUBLESHOOTING.md ("Application error codes").
   ============================================================ */
export const ERROR_MESSAGES = {
  // Authentication
  missing_token: 'Your session has expired. Please sign in again.',
  invalid_token: 'We couldn’t verify your sign-in. Please sign in again.',
  insufficient_scope: 'This action needs an interactive sign-in.',
  unauthorized: 'You’re not authorized to do that.',
  // Authorization / conflict
  forbidden: 'You don’t have permission to do that.',
  manage_in_entra: 'This group is managed in Entra ID and can’t be edited here.',
  name_taken: 'A group with that name already exists.',
  group_in_use: 'This group is still in use. Remove its policy assignments and mappings, or archive it instead.',
  already_passed: 'You’ve already passed this knowledge check.',
  already_signed: 'You’ve already acknowledged this version — no further action is needed unless a new version is published.',
  // Validation
  must_acknowledge: 'Please tick the acknowledgement box before signing.',
  name_required: 'Please enter a name.',
  no_rows: 'No valid rows were found in that file — check the columns and try again.',
  no_questions: 'Add at least one question before saving the quiz.',
  file_required: 'Please choose a file to upload.',
  no_url: 'Enter a forward URL first.',
  bad_url: 'That URL isn’t allowed — use a public http(s) address.',
  unsafe_url: 'That URL isn’t allowed — use a public http(s) address.',
  bad_id: 'That link is no longer valid.',
  bad_name: 'That file name isn’t allowed.',
  // Not found
  not_found: 'That item could not be found.',
  policy_not_found: 'That document could not be found.',
  no_file: 'No file is attached to this document.',
  no_quiz: 'This document has no knowledge check.',
  missing_file: 'The file for this document is missing — please contact your administrator.',
  // Quiz flow
  quiz_required: 'Please pass the knowledge check before signing.',
  no_attempts_left: 'You’ve used all your attempts — contact your administrator to reset them.',
  // Approval workflow
  no_approvers: 'Add at least one approver before submitting for approval.',
  not_pending_approver: 'It’s not your turn to approve this — an earlier approver is up first.',
  comment_required: 'Please add a comment when rejecting or requesting changes.',
  not_approved: 'This policy must be approved before it can be published.',
  already_approved: 'This version is already approved. Create a new version before submitting it for approval again.',
  bad_state: 'This policy isn’t in the right state for that action — refresh and try again.',
  // Uploads / files / integration / server
  upload_failed: 'Upload failed — check the file type and size (max 250 MB).',
  read_failed: 'The file couldn’t be opened. Please try again.',
  feed_disabled: 'The audit feed is turned off.',
  sharepoint_browse_failed: 'Couldn’t reach SharePoint — check the site configuration.',
  backup_failed: 'The backup failed — check the server logs.',
  rate_limited: 'Too many requests in a short time. Please wait a minute or two and try again.',
  server_error: 'Something went wrong on our side. Please try again.',
};

// Resolve the best message for a response: a curated friendly message for a known
// code, else the server-supplied detail, else the raw code, else a generic line.
export function friendlyError(code, detail) {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (detail) return detail;
  if (code) return code;
  return 'Something went wrong. Please try again.';
}
