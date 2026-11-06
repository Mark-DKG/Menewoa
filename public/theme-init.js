/* Runs before first paint (loaded as a blocking, same-origin script so a strict CSP
   needs no 'unsafe-inline'). Applies the saved choice, else the OS preference, so the
   page never flashes the wrong theme. Only the words "light"/"dark" are stored. */
(function () {
  var theme = "light";
  try {
    var saved = window.localStorage.getItem("menewoa-theme");
    if (saved === "light" || saved === "dark") theme = saved;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch (e) {
    try { if (window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark"; } catch (e2) {}
  }
  var root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#17100F" : "#7F011F");
})();
