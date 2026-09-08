// Paddle.js v2 (Paddle Billing) overlay checkout loader.
//
// The client-side token is designed to be public: it can only open checkouts
// for prices configured in your Paddle account — it can never read your account
// or create transactions. The transaction itself is still created server-side
// by the paddle-subscribe edge function (so custom_data.user_id is trusted), and
// this module only opens Paddle's overlay for that transaction ID.
//
// If VITE_PADDLE_CLIENT_TOKEN is empty, callers should fall back to the hosted
// checkout URL returned by paddle-subscribe.

type PaddleEvent = { name?: string; data?: { id?: string } };

type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (opts: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Checkout: { open: (opts: Record<string, unknown>) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

let loadPromise: Promise<PaddleGlobal> | null = null;
let initialized = false;
let onCompletedHandler: (() => void) | null = null;

export function paddleClientToken(): string {
  try {
    return (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined) || "";
  } catch {
    return "";
  }
}

function paddleEnvironment(): string {
  try {
    return (import.meta.env.VITE_PADDLE_ENV as string | undefined) === "production"
      ? "production"
      : "sandbox";
  } catch {
    return "sandbox";
  }
}

function loadScript(): Promise<PaddleGlobal> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Paddle.js requires a browser"));
      return;
    }
    if (window.Paddle) {
      resolve(window.Paddle);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.Paddle) resolve(window.Paddle);
      else reject(new Error("Paddle.js loaded but window.Paddle is missing"));
    };
    script.onerror = () => reject(new Error("Failed to load Paddle.js"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function ensureInitialized(paddle: PaddleGlobal) {
  if (initialized) return;
  paddle.Environment.set(paddleEnvironment());
  paddle.Initialize({
    token: paddleClientToken(),
    eventCallback: (event) => {
      if (event?.name === "checkout.completed") onCompletedHandler?.();
    },
  });
  initialized = true;
}

/**
 * If the page URL contains a Paddle payment link (`?_ptxn=txn_…`), open the
 * overlay checkout for it. Paddle's hosted checkout redirect lands on this URL;
 * Paddle.js would auto-open it, but we load Paddle.js lazily, so do it here.
 * Cleans the query param afterwards so a refresh doesn't re-open the checkout.
 */
export async function openPendingCheckoutFromUrl(opts?: {
  onCompleted?: () => void;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const txnId = params.get("_ptxn");
  if (!txnId) return false;
  try {
    params.delete("_ptxn");
    const next = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (next ? `?${next}` : ""));
  } catch { /* ignore */ }
  return openPaddleOverlay({ transactionId: txnId, onCompleted: opts?.onCompleted });
}

/**
 * Open the Paddle overlay checkout for a server-created transaction.
 * Returns true when the overlay was opened, false when the client token isn't
 * configured (callers should then redirect to the hosted checkout URL).
 */
export async function openPaddleOverlay(opts: {
  transactionId?: string;
  email?: string;
  onCompleted?: () => void;
}): Promise<boolean> {
  if (!paddleClientToken() || !opts.transactionId) return false;
  try {
    const paddle = await loadScript();
    onCompletedHandler = opts.onCompleted ?? null;
    ensureInitialized(paddle);
    paddle.Checkout.open({
      transactionId: opts.transactionId,
      customer: opts.email ? { email: opts.email } : undefined,
    });
    return true;
  } catch {
    return false;
  }
}
