import React from "react";
import { ChevronLeft, FileText, Shield, CircleAlert } from "lucide-react";
import { COLORS, displayFont } from "../theme/tokens.js";
import { ThemeToggle } from "../theme/ThemeProvider.jsx";
import { LEGAL, fill } from "../config/legal.js";
import { PRIVACY, TERMS } from "../config/legalContent.js";

// Bracketed text such as [CONTACT EMAIL] is an unfilled placeholder. While the pages are marked
// "draft" it is highlighted so nobody can miss it; once status is "final" there must be none left
// (tests/unit/legal.test.js enforces that).
function Text({ children }) {
  const text = fill(children);
  if (LEGAL.status !== "draft") return text;
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part)
      ? <mark key={i} style={{ backgroundColor: COLORS.sand, color: COLORS.wine, padding: "0 .25em", borderRadius: 4 }}>{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

function Block({ block }) {
  const body = { color: COLORS.inkSoft };
  if (block.p) return <p className="mt-3 text-[15px] leading-relaxed" style={body}><Text>{block.p}</Text></p>;
  if (block.note) {
    return (
      <p className="mt-4 text-[15px] leading-relaxed rounded-2xl px-4 py-3" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}>
        <Text>{block.note}</Text>
      </p>
    );
  }
  if (block.ul) {
    return (
      <ul className="mt-3 space-y-2 text-[15px] leading-relaxed list-disc pl-5" style={body}>
        {block.ul.map((item, i) => <li key={i}><Text>{item}</Text></li>)}
      </ul>
    );
  }
  return null;
}

export function LegalDocument({ doc, goTo, icon: Icon = Shield, other }) {
  const draft = LEGAL.status === "draft";
  return (
    <div style={{ backgroundColor: COLORS.white, minHeight: "100vh" }}>
      <header className="flex items-center justify-between px-6 md:px-12 py-5 max-w-3xl mx-auto">
        <button onClick={() => goTo("landing")} className="flex items-center gap-1 text-sm font-semibold" style={{ color: COLORS.wine }}>
          <ChevronLeft size={16} /> Back
        </button>
        <ThemeToggle />
      </header>

      <main className="px-6 md:px-12 max-w-3xl mx-auto pb-16">
        {draft && (
          <div role="note" data-testid="draft-banner" className="flex items-start gap-3 rounded-2xl border px-4 py-3 mb-6 text-sm"
            style={{ borderColor: COLORS.wine, color: COLORS.ink }}>
            <CircleAlert size={18} color={COLORS.wine} className="shrink-0 mt-0.5" />
            <p><b>Draft, pending legal review.</b> This text describes how Menewoa works but has not yet been approved by a lawyer, and some details in [brackets] still need to be filled in.</p>
          </div>
        )}

        <Icon size={26} color={COLORS.wine} className="mb-3" />
        <h1 className="text-3xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>{doc.title}</h1>
        <p className="mt-1 text-xs" style={{ color: COLORS.inkSoft }}>Last updated {LEGAL.lastUpdated} · version {LEGAL.termsVersion}</p>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: COLORS.inkSoft }}><Text>{doc.intro}</Text></p>

        <nav aria-label={`${doc.title} contents`} className="mt-6 rounded-2xl border px-4 py-3" style={{ borderColor: COLORS.line }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.inkSoft }}>On this page</p>
          <ol className="text-sm space-y-1 list-decimal pl-5">
            {doc.sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="underline" style={{ color: COLORS.wine }}><Text>{s.title}</Text></a></li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-6">
            <h2 className="text-xl font-semibold mt-9" style={{ ...displayFont, color: COLORS.ink }}><Text>{s.title}</Text></h2>
            {s.blocks.map((b, i) => <Block key={i} block={b} />)}
          </section>
        ))}

        <p className="mt-12 text-sm" style={{ color: COLORS.inkSoft }}>
          See also:{" "}
          <button onClick={() => goTo(other.path)} className="underline font-semibold" style={{ color: COLORS.wine }}>{other.label}</button>
        </p>
      </main>
    </div>
  );
}

export const PrivacyPage = ({ goTo }) => (
  <LegalDocument doc={PRIVACY} goTo={goTo} icon={Shield} other={{ path: "terms", label: "Terms of Service" }} />
);
export const TermsPage = ({ goTo }) => (
  <LegalDocument doc={TERMS} goTo={goTo} icon={FileText} other={{ path: "privacy", label: "Privacy Policy" }} />
);

/** Links that open the documents in a new tab, so a half-filled form or a consent prompt is never lost. */
export function LegalLink({ to, children }) {
  return (
    <a href={to === "terms" ? "/terms" : "/privacy"} target="_blank" rel="noopener noreferrer" className="underline font-semibold" style={{ color: COLORS.wine }}>
      {children}
    </a>
  );
}
