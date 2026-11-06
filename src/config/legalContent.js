// The text of the Privacy Policy and the Terms of Service.
//
// DRAFT. This is written to match what the software actually does (docs/LEGAL.md maps each
// statement to the code that enforces it) but it is NOT legal advice: have a lawyer qualified in
// your jurisdiction review it before launch. If the product changes, change this text in the same
// commit — tests/unit/legal.test.js guards the statements that matter most.
//
// Blocks: { p: "paragraph" } | { ul: ["item", ...] } | { note: "highlighted paragraph" }
// {tokens} are filled from src/config/legal.js.

export const PRIVACY = {
  title: "Privacy Policy",
  intro:
    "Menewoa is a private space to track your cycle and, if you choose, to help someone you trust support you. " +
    "This policy explains what we collect, why, who can see it, and the control you have. We have tried to write it in plain language.",
  sections: [
    {
      id: "who",
      title: "Who we are",
      blocks: [
        { p: "{appName} is operated by {operator} (\"we\", \"us\"). We decide how and why your personal information is used, which makes us the \"controller\" of it under data-protection law." },
        { p: "Questions, requests or complaints: {contactEmail}." },
      ],
    },
    {
      id: "collect",
      title: "What we collect",
      blocks: [
        { p: "Only what the app needs to work:" },
        {
          ul: [
            "Account details: your name (a nickname is fine), email address, time zone, and whether you signed up as someone tracking their cycle or someone supporting a partner. Your password is handled by our sign-in provider and stored only as a one-way hash; we cannot read it.",
            "Health information you choose to log: period start and end dates, flow, symptoms, mood, sleep and energy, private notes, and your cycle settings. Nothing is required except what you decide to enter.",
            "Estimates we calculate from your own logs: your expected next period and fertile window. These are estimates, not medical advice.",
            "Partner connection details: whether you are connected to a partner, what you have chosen to share with them, and your invitation history.",
            "Notification settings and, if you turn on notifications on a device, that device's push address (an address issued by your browser's push service, plus its encryption keys).",
            "Reports you send us about a safety or privacy concern, and what you write in them.",
            "A record of when you accepted these documents and consented to us handling your health information.",
            "Basic technical data created by the services we run on: for example IP address and request details in security and hosting logs. We do not use analytics or advertising trackers.",
          ],
        },
      ],
    },
    {
      id: "why",
      title: "Why we use it, and your consent",
      blocks: [
        { p: "We use your information to run the service: to let you sign in, record and view your cycle, calculate estimates, send the reminders you ask for, connect you with a partner if you choose, keep the service secure and handle reports, and to meet our legal obligations." },
        { p: "Information about your health is especially sensitive. We handle it only because you gave your explicit consent when you signed up (or when you were asked again in the app). You can withdraw that consent at any time: stop logging, switch off sharing, or delete your account (see \"Your rights\"). Withdrawing does not affect anything we did before." },
        { p: "We do not sell your information, we do not use it for advertising, and we do not use it to train advertising or profiling models." },
      ],
    },
    {
      id: "partner",
      title: "Sharing with a partner",
      blocks: [
        { p: "Nothing is shared with anyone unless you invite them and tick the consent box when you create the invitation. A partner never has access to your account or your logs. They see a short, recent summary of only the items you switched on: period dates, expected period, mood, symptoms, fertility estimate, private notes, sleep and energy, and support tips. The sensitive ones are off by default." },
        { p: "You can change what is shared, disconnect, or block your partner at any moment; the change takes effect straight away. Invitation codes are single-use, expire after 3 days, and are stored only in scrambled form." },
        { note: "Please only invite someone you trust. Once a partner has seen something, we cannot make them forget it." },
      ],
    },
    {
      id: "admins",
      title: "Administrator access",
      blocks: [
        { p: "A small number of authorised administrators run and protect the service. By default they can see account-level details (such as your name and email, and whether your account is active) and anonymous, aggregated statistics. Statistics about small groups (fewer than 5 people) are hidden so no individual can be picked out." },
        { p: "In rare cases an administrator may need to view your logs: when you ask us for support, to investigate a serious safety or abuse report, or where the law requires it. This is the only way an administrator can read your logs, and it is controlled:" },
        {
          ul: [
            "they must choose a reason category and write a reason, and the access is recorded in a permanent audit log before anything is shown;",
            "it covers only the most recent 90 days, and your private notes are excluded unless the administrator specifically needs them and says so;",
            "it is rate-limited, and administrators cannot use it on their own account;",
            "you can see every such access (date and reason category) in Profile → Privacy, so you can tell when it happened.",
          ],
        },
        { p: "Administrators can also suspend or remove accounts that break our Terms, always with a written reason that is recorded." },
      ],
    },
    {
      id: "providers",
      title: "Who else handles your information",
      blocks: [
        { p: "We use a small number of service providers to run {appName}. They process your information only on our instructions:" },
        {
          ul: [
            "Supabase: our database and sign-in service. Your data is stored in its London (UK) region.",
            "Vercel: hosts the app's web pages.",
            "{emailProvider}: sends the emails we need to send you, such as confirming your address and resetting a password.",
            "Browser push services (run by the maker of your browser or device, such as Google, Apple, Mozilla or Microsoft): only if you turn on notifications. They carry a fixed, generic signal (for example \"upcoming period\"); we never send your dates, moods or symptoms through them.",
          ],
        },
        { p: "We may also disclose information if the law requires it, or to protect someone's safety, and only to the extent necessary. Because these providers and your own device may be in other countries, your information can be handled outside the country you live in; we choose providers that protect it to a comparable standard." },
      ],
    },
    {
      id: "notifications",
      title: "Notifications",
      blocks: [
        { p: "You choose which reminders you get: an upcoming period, a period starting, a gentle reminder to log, updates about your partner connection, and announcements from us. You can change these at any time in Profile." },
        { p: "Lock-screen notifications are generic by default (\"Open Menewoa\") so no one glancing at your phone learns anything. You can opt in to more detail. If you share your expected period with a partner, they may get a reminder too. Push notifications can be turned off per device, and are switched off when you log out." },
      ],
    },
    {
      id: "retention",
      title: "How long we keep it",
      blocks: [
        {
          ul: [
            "Your logs and settings: until you delete them or your account.",
            "If you delete your account, your profile and everything you logged is removed immediately. Encrypted backups of our database keep a copy for up to 30 days before they expire.",
            "In-app notifications: 90 days. Used or expired invitations: 30 days. Short-term security counters: 2 days.",
            "The audit log of administrator actions: kept long-term as a security record. It contains no health information; it records what an administrator did, to which account, when, and the reason they gave.",
          ],
        },
      ],
    },
    {
      id: "security",
      title: "How we protect it",
      blocks: [
        { p: "Every table that holds your information refuses access to anyone but you, enforced by the database itself and not just the app. Connections are encrypted, passwords are never stored in readable form, administrator access is limited and recorded, and backups are encrypted. No system is perfectly secure; if something goes wrong that affects you, we will tell you and the regulator as the law requires." },
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      blocks: [
        {
          ul: [
            "See and download your data: Profile → Privacy → Download my data.",
            "Correct it: edit or delete any entry in the app.",
            "Delete it: Profile → Delete account removes your account and everything you logged.",
            "Withdraw consent and control sharing: at any time, as described above.",
            "Ask us questions, object to how we use your information, or ask for a human to look at a request: {contactEmail}.",
            "Complain to {regulator} if you think we have not handled your information properly.",
          ],
        },
      ],
    },
    {
      id: "children",
      title: "Age",
      blocks: [{ p: "{appName} is for people aged 18 and over. We do not knowingly collect information from anyone younger. If you believe someone under 18 has signed up, tell us at {contactEmail} and we will remove the account." }],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      blocks: [{ p: "If we make a material change we will tell you in the app and ask you to accept it again before you carry on. The date at the top shows when this policy was last updated." }],
    },
    {
      id: "medical",
      title: "Not medical advice",
      blocks: [{ p: "{appName} is a tracking and support tool. It is not a medical device, does not diagnose anything, is not contraception, and must not be used to prevent or plan a pregnancy. Speak to a doctor or clinic about anything that worries you." }],
    },
  ],
};

export const TERMS = {
  title: "Terms of Service",
  intro: "These terms are the agreement between you and {operator} about using {appName}. Please read them; by creating an account you agree to them.",
  sections: [
    {
      id: "about",
      title: "What {appName} is",
      blocks: [
        { p: "{appName} lets you track your menstrual cycle, see estimates based on your own history, receive reminders, and, if you choose, share limited information with a partner so they can support you." },
        { note: "{appName} is not a medical service. Its predictions are estimates, not a diagnosis, treatment or advice. It is not contraception and must never be relied on to prevent or plan a pregnancy. If you feel unwell, or something seems wrong, contact a doctor or clinic. In an emergency contact your local emergency services." },
      ],
    },
    {
      id: "eligibility",
      title: "Who can use it",
      blocks: [{ p: "You must be 18 or over, and able to enter into a binding agreement. Create one account for yourself and provide accurate information; you may not use someone else's account." }],
    },
    {
      id: "account",
      title: "Your account",
      blocks: [
        { p: "Choose a strong password and keep it private. You are responsible for what happens under your account. Tell us promptly at {contactEmail} if you think someone else has access to it." },
        { p: "You choose whether you are tracking your cycle or supporting a partner when you sign up. Administrator rights are granted only by us and cannot be requested." },
      ],
    },
    {
      id: "partners",
      title: "Partner sharing",
      blocks: [
        { p: "Sharing is your choice and your control. If you invite a partner, you decide what they can see and can stop sharing at any time. If you are the partner, you agree to:" },
        {
          ul: [
            "use what you are shown only to support the person who shared it with you;",
            "keep it confidential, and never pass it on, publish it or use it to pressure, monitor, control or harass anyone;",
            "disconnect if she asks you to, and respect it if she blocks you.",
          ],
        },
        { p: "No one may pressure or coerce another person into sharing. If you are worried about someone's safety or you feel pressured, use Report in the app or contact {contactEmail}." },
      ],
    },
    {
      id: "use",
      title: "Acceptable use",
      blocks: [
        { p: "You agree not to:" },
        {
          ul: [
            "harass, threaten, stalk or abuse anyone, or use the app to do so;",
            "try to access another person's account or information, or probe, disrupt or bypass the app's security;",
            "scrape, copy, resell or reverse-engineer the service, except as the law allows;",
            "send false or malicious reports, or upload anything unlawful;",
            "use the app in a way that breaks the law.",
          ],
        },
      ],
    },
    {
      id: "content",
      title: "Your information",
      blocks: [
        { p: "What you log is yours. You give us only the permission we need to store it, process it, and show it as you direct (to you, and to a partner if you share), so we can run the service. How we handle it is described in the Privacy Policy, which forms part of these terms. You can download or delete your data at any time." },
      ],
    },
    {
      id: "notifications",
      title: "Notifications and emails",
      blocks: [{ p: "With your permission we send in-app and push notifications, and we send essential emails such as confirming your address or resetting your password. You can turn notifications off in Profile or in your device settings." }],
    },
    {
      id: "moderation",
      title: "Reports, suspension and removal",
      blocks: [
        { p: "If an account breaks these terms or puts someone at risk, we may warn, suspend or remove it. Where we can, we will tell you why. If you think we got it wrong, write to {contactEmail}. A suspended account loses access to its data in the app, but you can still ask for a copy of your data. Administrators act on accounts only with a recorded reason, as set out in the Privacy Policy." },
      ],
    },
    {
      id: "availability",
      title: "The service and changes to it",
      blocks: [
        { p: "We work to keep {appName} available and accurate, but we provide it \"as is\" and cannot promise it will always be uninterrupted or error-free. We may change, add or remove features. Please download a copy of anything you cannot afford to lose; we keep backups for recovery, not as a service to you." },
      ],
    },
    {
      id: "liability",
      title: "Our responsibility",
      blocks: [
        { p: "Nothing in these terms limits any right or responsibility that the law does not allow us to limit, including liability for death or personal injury caused by negligence, or for fraud." },
        { p: "Subject to that, and to the extent the law permits, we are not liable for loss that was not a foreseeable result of our breach, for decisions you make relying on estimates or information in the app instead of medical advice, or for what another person does with information you chose to share with them." },
        { p: "[Counsel to confirm the limit of liability and any indemnity appropriate for this service and jurisdiction.]" },
      ],
    },
    {
      id: "ending",
      title: "Ending your use",
      blocks: [{ p: "You can stop at any time and delete your account in Profile → Delete account; this permanently removes your data (backups expire within 30 days). We may end or suspend your access as described above, or if we stop offering the service, in which case we will give notice where we reasonably can." }],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      blocks: [{ p: "If we make a material change we will tell you in the app and ask you to accept the new version before you carry on. If you do not agree, you can delete your account. The date at the top shows when these terms were last updated." }],
    },
    {
      id: "law",
      title: "Governing law",
      blocks: [{ p: "These terms are governed by {governingLaw}. This does not remove any consumer protection you have under the law where you live." }],
    },
    {
      id: "contact",
      title: "Contact",
      blocks: [{ p: "{operator} — {contactEmail}." }],
    },
  ],
};
