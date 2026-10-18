// Reusable 45-degree hatching. Render once inside each <svg> that uses it, then fill="url(#hatch-seal)" etc.
const COLORS: Record<string, string> = {
  seal: "var(--seal)", ochre: "var(--ochre)", engrave: "var(--engrave)", ink: "var(--ink)", verified: "var(--verified)",
};

export function HatchDefs() {
  return (
    <defs>
      {Object.entries(COLORS).map(([name, color]) => (
        <pattern key={name} id={`hatch-${name}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="2" />
        </pattern>
      ))}
    </defs>
  );
}
