// Turns database / auth errors into calm, specific, non-technical messages.
// Raw error text is never shown to users and never logged with health data.

const BY_MESSAGE = {
  date_in_future: "That date is in the future. Please choose today or earlier.",
  end_before_start: "The end date can't be before the start date.",
  period_overlaps_existing: "That overlaps a period you've already logged. Edit or remove the existing one first.",
  rate_limited: "You're going a little fast. Please wait a few minutes and try again.",
  consent_required: "Please confirm that you consent to sharing before creating an invitation.",
  invalid_permissions: "Those sharing options aren't valid. Please try again.",
  already_connected: "You're already connected with someone. Disconnect first to connect with someone else.",
  invalid_or_expired: "That code isn't valid or has expired. Ask for a new one.",
  reason_required: "A written reason of at least 10 characters is required.",
  invalid_reason_category: "Choose a reason category.",
  too_many_symptoms: "You can log up to 20 symptoms per day.",
  too_many_tips: "You can keep up to 20 tips. Remove one to add another.",
  invalid_timezone: "That time zone isn't recognised.",
  cannot_target_self: "You can't do that to your own account.",
  cannot_target_admin: "That account can't be changed from here.",
  not_found: "We couldn't find that.",
  forbidden: "You don't have permission to do that.",
  not_authenticated: "Your session has ended. Please sign in again.",
};

const AUTH = [
  [/invalid login credentials/i, "That email and password don't match. Check them and try again."],
  [/email not confirmed/i, "Please confirm your email first. We sent you a link when you signed up."],
  [/user already registered|already been registered/i, "If that email can be used, you'll receive a message shortly. Otherwise try signing in."],
  [/password.*(weak|short|at least)|weak_password/i, "Please choose a stronger password."],
  [/rate limit|too many requests|over_.*_rate_limit/i, "Too many attempts. Please wait a few minutes and try again."],
  [/token.*(expired|invalid)|otp_expired|link.*expired/i, "That link has expired. Please request a new one."],
  [/same.*password|different from the old/i, "Choose a password you haven't used before."],
  [/jwt expired|refresh_token_not_found|invalid refresh token|session.*(missing|expired)/i, "Your session has ended. Please sign in again."],
];

export function friendlyError(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  const msg = String(err.message || err.error_description || err.msg || "");
  for (const key of Object.keys(BY_MESSAGE)) if (msg.includes(key)) return BY_MESSAGE[key];
  for (const [re, text] of AUTH) if (re.test(msg) || re.test(String(err.code || ""))) return text;
  if (err.code === "42501" || err.code === "PGRST301") return BY_MESSAGE.forbidden;
  if (err.code === "54000") return BY_MESSAGE.rate_limited;
  if (err.code === "23514") return "Please check the values you entered.";
  if (err.code === "23505") return "That already exists.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You appear to be offline. Check your connection and try again.";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "We couldn't reach the server. Check your connection and try again.";
  return fallback;
}

export function isSessionError(err) {
  const msg = String(err?.message || "");
  return err?.status === 401 || err?.code === "PGRST301" || /jwt expired|invalid jwt|not_authenticated|refresh_token/i.test(msg);
}
