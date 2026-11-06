// Web Push opt-in. Subscriptions are stored server-side via validated RPCs (max 5 per user,
// ownership moves if the same device signs in as someone else). Payloads are generic — see
// public/sw.js and supabase/functions/send-notifications. Nothing here touches health data.
import { supabase } from "./supabase.js";

const VAPID_PUBLIC_KEY = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) || "";

export const pushConfigured = () => Boolean(VAPID_PUBLIC_KEY);

export function pushSupported() {
  return pushConfigured() && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "unsupported" | "denied" | "on" | "off" */
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Notifications aren't available on this device.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. You can allow them in your browser settings.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("This browser returned an incomplete subscription.");
  const { error } = await supabase.rpc("register_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
  if (error) {
    await sub.unsubscribe().catch(() => {});
    throw new Error("We couldn't turn notifications on. Please try again.");
  }
}

/** Remove this device from the account (call BEFORE signing out, while the session is valid). */
export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.rpc("unregister_push_subscription", { p_endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch { /* best effort */ }
}
