export const BACKEND = process.env.E2E_BACKEND === "1";
export const needsBackend = (test) => test.skip(!BACKEND, "needs a disposable Supabase project (see docs/TESTING.md)");

// Unique throwaway identities so repeated runs never collide.
export const uniqueEmail = (tag) => `e2e+${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
export const PASSWORD = "e2e-Password-12345";
