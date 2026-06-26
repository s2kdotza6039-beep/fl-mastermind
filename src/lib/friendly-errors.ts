// Map low-level auth/role errors to user-facing messages.
// Never leak SQL, table names, policy names, or internal guard wording.

export function friendlySignupError(raw: string | undefined | null): string {
  const msg = (raw || "").toLowerCase();

  if (!msg) return "We couldn't create your account. Please try again.";

  if (msg.includes("already registered") || msg.includes("user already") || msg.includes("duplicate")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("pwned") || msg.includes("breach"))) {
    return "That password is too weak or has appeared in known breaches. Please choose a stronger one.";
  }
  if (msg.includes("rate") && msg.includes("limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return "That email address doesn't look valid.";
  }
  if (msg.includes("captcha")) {
    return "Bot check failed. Please refresh and try again.";
  }
  // Role assignment / database trigger failures during signup.
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

export function friendlyRoleAssignmentError(raw: string | undefined | null): string {
  const msg = (raw || "").toLowerCase();
  if (msg.includes("forbidden") || msg.includes("not allowed")) {
    return "You don't have permission to change roles.";
  }
  if (msg.includes("invalid")) {
    return "That role change isn't allowed.";
  }
  if (msg.includes("refusing to remove your own admin")) {
    return "You can't remove your own admin role.";
  }
  if (msg.includes("rate") && msg.includes("limit")) {
    return "Too many role changes in a short time. Please wait and try again.";
  }
  return "Couldn't update that role. Please try again.";
}
