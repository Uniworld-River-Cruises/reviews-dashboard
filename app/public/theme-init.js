(function () {
  try {
    var theme = localStorage.getItem("theme");
    var prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    var shouldUseDark = theme === "dark" || (!theme && prefersDark);

    document.documentElement.classList.toggle("dark", shouldUseDark);
    document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light";
  } catch (error) {
    // Ignore client-side storage/theme bootstrap failures.
  }
})();
