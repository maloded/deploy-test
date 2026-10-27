/** Development-only floating switcher. Plain links to ?theme=<name>; no client JavaScript. */
export function ThemeSwitcher({
  themes,
  current,
  warnings,
}: {
  themes: string[];
  current: string;
  warnings: string[];
}) {
  return (
    <aside className="theme-switcher" aria-label="Theme switcher (development only)">
      <strong className="theme-switcher__label">Theme</strong>
      {themes.map((name) => (
        <a key={name} href={`?theme=${name}`} aria-current={name === current ? "true" : undefined}>
          {name}
        </a>
      ))}
      {warnings.map((w) => (
        <span key={w} className="theme-switcher__warning">
          {w}
        </span>
      ))}
    </aside>
  );
}
