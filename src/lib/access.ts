/**
 * The only accounts allowed into this space. Keep this list in sync with the
 * allowed_emails table in supabase/migrations/0007_allowed_emails.sql, which enforces it on the server.
 */
export const ALLOWED_EMAILS = ['rectojustine84@gmail.com', 'gucelamary21@gmail.com'] as const;

export const ACCESS_DENIED_MESSAGE =
  'Sorry, this memory capsule is private and accessible only to Justine and Mary Rose. No one else is allowed to access it. Please sign in using the email address provided to you.';

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (ALLOWED_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}
