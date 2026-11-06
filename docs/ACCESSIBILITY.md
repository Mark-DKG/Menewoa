# Accessibility notes

Implemented: semantic landmarks and headings; every control has an accessible name; form fields use real `<label>`s with inline `role="alert"` errors; toggles are `role="switch"` with `aria-checked`; pills expose `aria-pressed`; calendar days announce date + status ("estimated period", "symptoms logged", "today"); toasts use `role="status"`/`"alert"`; destructive confirmations use `role="alertdialog"`; the day/night toggle is a real button labelled "Switch to dark/light mode", reachable by keyboard; `prefers-reduced-motion` is respected; colour is never the only signal (legend text + labels); light and dark palettes were checked for ≥4.5:1 contrast on text pairs.

Not yet verified (do before launch): a screen-reader pass (VoiceOver/TalkBack/NVDA), full keyboard walkthrough of every dialog, axe-core scan (`@axe-core/playwright` is a suggested addition), 200% zoom and phone-width layout review with the compiled Tailwind CSS.
