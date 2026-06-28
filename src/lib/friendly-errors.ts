// Map low-level auth/role errors to user-facing messages.
// Never leak SQL, table names, policy names, or internal guard wording.

type AuthErrLike =
  | string
  | null
  | undefined
  | {
      message?: string;
      status?: number;
      code?: string;
      name?: string;
      // Some clients attach the raw Response or headers; we read them defensively.
      response?: { headers?: Headers | Record<string, string> };
      headers?: Headers | Record<string, string>;
    };

interface Normalized {
  msg: string;
  status?: number;
  code?: string;
  raw: AuthErrLike;
}

function normalize(raw: AuthErrLike): Normalized {
  if (!raw) return { msg: "", raw };
  if (typeof raw === "string") return { msg: raw.toLowerCase(), raw };
  return {
    msg: (raw.message || "").toLowerCase(),
    status: raw.status,
    code: raw.code,
    raw,
  };
}

export function isRateLimited(raw: AuthErrLike): boolean {
  const { msg, status, code } = normalize(raw);
  if (status === 429) return true;
  if (code && /rate|throttle|too_many/i.test(code)) return true;
  return (
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("rate_limit") ||
    msg.includes("too many requests") ||
    msg.includes("too many attempts") ||
    msg.includes("over_request_rate_limit") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("throttle")
  );
}

export function isCaptchaFailure(raw: AuthErrLike): boolean {
  const { msg, code } = normalize(raw);
  if (code && /captcha/i.test(code)) return true;
  return msg.includes("captcha") || msg.includes("hcaptcha") || msg.includes("recaptcha");
}

/**
 * Best-effort extraction of a retry-after duration (seconds) from a 429 error.
 * Looks at: response/header `Retry-After`, message phrasing like "try again in 42 seconds",
 * and falls back to 60s.
 */
export function parseRetryAfterSec(raw: AuthErrLike, fallback = 60): number {
  if (!raw || typeof raw === "string") {
    return extractFromText(typeof raw === "string" ? raw : "", fallback);
  }

  const headerSources: Array<Headers | Record<string, string> | undefined> = [
    raw.headers,
    raw.response?.headers,
  ];
  for (const h of headerSources) {
    if (!h) continue;
    const val =
      typeof (h as Headers).get === "function"
        ? (h as Headers).get("retry-after") ?? (h as Headers).get("Retry-After")
        : (h as Record<string, string>)["retry-after"] ?? (h as Record<string, string>)["Retry-After"];
    if (val) {
      const n = parseRetryAfterHeader(val);
      if (n != null) return clamp(n, 1, 3600, fallback);
    }
  }
  return extractFromText(raw.message || "", fallback);
}

function parseRetryAfterHeader(val: string): number | null {
  const asInt = Number(val);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.ceil(asInt);
  const asDate = Date.parse(val);
  if (!Number.isNaN(asDate)) return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  return null;
}

function extractFromText(text: string, fallback: number): number {
  const m =
    text.match(/try again in (\d+)\s*(seconds?|secs?|s)\b/i) ||
    text.match(/wait (\d+)\s*(seconds?|secs?|s)\b/i) ||
    text.match(/after (\d+)\s*(seconds?|secs?|s)\b/i) ||
    text.match(/for (\d+)\s*(seconds?|secs?|s)\b/i);
  if (m) return clamp(parseInt(m[1], 10), 1, 3600, fallback);
  return fallback;
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function friendlySignupError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;

  if (!msg && !n.status) return "We couldn't create your account. Please try again.";

  if (isRateLimited(raw)) {
    return "Too many sign-up attempts from this device. Please wait a minute and try again.";
  }
  if (isCaptchaFailure(raw)) {
    return "Bot check failed. Please refresh the page and try again.";
  }
  if (msg.includes("already registered") || msg.includes("user already") || msg.includes("duplicate")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("pwned") || msg.includes("breach"))) {
    return "That password is too weak or has appeared in known breaches. Please choose a stronger one.";
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return "That email address doesn't look valid.";
  }
  if (
    msg.includes("user_roles") ||
    msg.includes("role") ||
    msg.includes("permission denied") ||
    msg.includes("policy") ||
    msg.includes("trigger") ||
    msg.includes("database error")
  ) {
    return "We couldn't finish setting up your account. Please try again in a moment, or contact support if it keeps happening.";
  }
  return "We couldn't create your account. Please try again.";
}

export function friendlySignInError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;

  if (!msg && !n.status) return "We couldn't sign you in. Please try again.";

  if (isRateLimited(raw)) {
    return "Too many sign-in attempts. Please wait a minute before trying again.";
  }
  if (isCaptchaFailure(raw)) {
    return "Bot check failed. Please refresh the page and try again.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("invalid_grant")) {
    return "Email or password is incorrect.";
  }
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
    return "Please confirm your email address first — check your inbox for the verification link.";
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return "That email address doesn't look valid.";
  }
  if (msg.includes("user not found")) {
    return "No account found with that email. Try signing up instead.";
  }
  return "We couldn't sign you in. Please try again.";
}

export function friendlyPasswordResetError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;

  if (!msg && !n.status) return "We couldn't update your password. Please try again.";

  if (isRateLimited(raw)) {
    return "Too many password reset attempts. Please wait a minute and try again.";
  }
  if (isCaptchaFailure(raw)) {
    return "Bot check failed. Please refresh the page and try again.";
  }
  if (msg.includes("expired") || msg.includes("invalid token") || msg.includes("token has expired")) {
    return "That reset link has expired. Please request a new one from the sign-in page.";
  }
  if (msg.includes("same password") || msg.includes("new password should be different")) {
    return "Your new password must be different from the current one.";
  }
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("pwned") || msg.includes("breach"))) {
    return "That password is too weak or has appeared in known breaches. Please choose a stronger one.";
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return "That email address doesn't look valid.";
  }
  return "We couldn't update your password. Please try again.";
}

export function friendlyEmailConfirmError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;

  if (!msg && !n.status) return "We couldn't confirm your email. Please try again.";

  if (isRateLimited(raw)) {
    return "Too many confirmation attempts. Please wait a minute before retrying.";
  }
  if (isCaptchaFailure(raw)) {
    return "Bot check failed. Please refresh the page and try again.";
  }
  if (msg.includes("expired") || msg.includes("token has expired") || msg.includes("otp_expired")) {
    return "Your confirmation link has expired. Request a new one from the sign-in page.";
  }
  if (msg.includes("already confirmed")) {
    return "This email is already confirmed — you can sign in now.";
  }
  if (msg.includes("invalid token") || msg.includes("invalid_otp")) {
    return "This confirmation link is no longer valid. Request a new one from the sign-in page.";
  }
  return "We couldn't confirm your email. Please try again.";
}

export function friendlyRoleAssignmentError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;
  if (isRateLimited(raw)) {
    return "Too many role changes in a short time. Please wait and try again.";
  }
  if (msg.includes("forbidden") || msg.includes("not allowed")) {
    return "You don't have permission to change roles.";
  }
  if (msg.includes("refusing to remove your own admin")) {
    return "You can't remove your own admin role.";
  }
  if (msg.includes("invalid")) {
    return "That role change isn't allowed.";
  }
  return "Couldn't update that role. Please try again.";
}
