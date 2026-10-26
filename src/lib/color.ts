/** Elige texto blanco u oscuro según el contraste con el color de fondo. */
export function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (1.05 / (L + 0.05) >= 4.5 ? "#ffffff" : "#2a2723");
}

export function brandStyle(primary: string, accent: string): React.CSSProperties {
  return { ["--brand" as string]: primary, ["--on-brand" as string]: readableOn(primary), ["--accent" as string]: accent };
}
