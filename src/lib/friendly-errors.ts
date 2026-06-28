// Map low-level auth/role errors to user-facing messages.
// Never leak SQL, table names, policy names, or internal guard wording.

type AuthErrLike =
  | string
  | null
  | undefined
  | { message?: string; status?: number; code?: string; name?: string };

function normalize(raw: AuthErrLike): { msg: string; status?: number; code?: string } {
  if (!raw) return { msg: "" };
  if (typeof raw === "string") return { msg: raw.toLowerCase() };
  return {
    msg: (raw.message || "").toLowerCase(),
    status: raw.status,
    code: raw.code,
  };
}

function isRateLimited({ msg, status, code }: { msg: string; status?: number; code?: string }) {
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

function isCaptcha({ msg, code }: { msg: string; code?: string }) {
  if (code && /captcha/i.test(code)) return true;
  return msg.includes("captcha") || msg.includes("hcaptcha") || msg.includes("recaptcha");
}

export function friendlySignupError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;

  if (!msg && !n.status) return "We couldn't create your account. Please try again.";

  if (isRateLimited(n)) {
    return "Too many sign-up attempts from this device. Please wait a minute and try again.";
  }
  if (isCaptcha(n)) {
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

  if (isRateLimited(n)) {
    return "Too many sign-in attempts. Please wait a minute before trying again.";
  }
  if (isCaptcha(n)) {
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

export function friendlyRoleAssignmentError(raw: AuthErrLike): string {
  const n = normalize(raw);
  const { msg } = n;
  if (isRateLimited(n)) {
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
