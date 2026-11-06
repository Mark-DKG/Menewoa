// Single source of truth for the legal pages and the consent record.
//
//   status        "draft" shows a visible "pending legal review" banner on /terms and /privacy.
//                 Set it to "final" ONLY after counsel has reviewed the text and every [PLACEHOLDER]
//                 below is filled in — tests/unit/legal.test.js fails the build if you don't.
//   termsVersion  Stored on each profile when someone accepts. Bump it (to the new date) ONLY for a
//                 material change: everyone is then asked to accept again before using the app.
//                 Wording fixes and typos do not need a new version.
export const LEGAL = {
  status: "draft",
  termsVersion: "2026-11-06",
  lastUpdated: "6 November 2026",

  appName: "Menewoa",
  operator: "[OPERATOR LEGAL NAME]",
  contactEmail: "[CONTACT EMAIL]",
  governingLaw: "[the laws of the Republic of Ghana, to be confirmed with counsel]",
  regulator: "[your data protection regulator, e.g. the Data Protection Commission in Ghana]",
  emailProvider: "[EMAIL DELIVERY PROVIDER]",
};

/** Replace {tokens} in a string with LEGAL values. Unknown tokens are left visible on purpose. */
export function fill(text, legal = LEGAL) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in legal ? String(legal[k]) : m));
}

/** True while any operator-specific placeholder is still in square brackets. */
export function unresolvedPlaceholders(legal = LEGAL) {
  return Object.entries(legal)
    .filter(([, v]) => typeof v === "string" && /\[[A-Z][^\]]*\]|\[the |\[your /.test(v))
    .map(([k]) => k);
}

/**
 * Must this person (re)accept before using the app?
 *   * never accepted, or accepted an older version
 *   * women must also have given explicit consent to process the health information they log
 * Partners log no health data, so only the Terms/Privacy acceptance applies to them.
 */
export function needsConsent(profile, legal = LEGAL) {
  if (!profile) return false;
  if (!profile.terms_accepted_at || !profile.terms_version || profile.terms_version < legal.termsVersion) return true;
  if (profile.role === "woman" && !profile.health_consent_at) return true;
  return false;
}
