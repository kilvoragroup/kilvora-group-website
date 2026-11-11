import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

/** Extrai o corpo do primeiro bloco `{ ... }` que começa após `marker` (com chavetas aninhadas). */
function block(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`Bloco não encontrado: ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`Bloco não fechado: ${marker}`);
}

/** Mapa token → valor declarado num bloco. */
function values(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--ds-[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const isColor = (t: string) => !t.startsWith("--ds-ring-");

const light = values(block(":root {"));
const darkMedia = values(block(':root:not([data-theme="light"])'));
const darkForced = values(block(':root[data-theme="dark"]'));
const bridge = block("@theme inline");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Pares [texto/elemento, fundo, mínimo WCAG AA]. 4.5 = texto normal; 3 = UI/gráficos. */
const pairs: [string, string, number][] = [
  ["--ds-foreground", "--ds-background", 4.5],
  ["--ds-surface-foreground", "--ds-surface", 4.5],
  ["--ds-muted-foreground", "--ds-background", 4.5],
  ["--ds-muted-foreground", "--ds-muted", 4.5],
  ["--ds-muted-foreground", "--ds-surface", 4.5],
  ["--ds-input", "--ds-background", 3],
  ["--ds-primary-foreground", "--ds-primary", 4.5],
  ["--ds-secondary-foreground", "--ds-secondary", 4.5],
  ["--ds-accent-foreground", "--ds-accent", 4.5],
  ["--ds-highlight-foreground", "--ds-highlight", 4.5],
  ["--ds-highlight", "--ds-background", 3],
  ["--ds-inverse-foreground", "--ds-inverse", 4.5],
  ["--ds-inverse-muted", "--ds-inverse", 4.5],
  ["--ds-success-foreground", "--ds-success", 4.5],
  ["--ds-warning-foreground", "--ds-warning", 4.5],
  ["--ds-danger-foreground", "--ds-danger", 4.5],
  ["--ds-info-foreground", "--ds-info", 4.5],
  ["--ds-ring", "--ds-background", 3],
];

describe("design tokens", () => {
  it("o tema escuro (sistema e forçado) redefine as mesmas cores do tema claro", () => {
    const lightColors = Object.keys(light).filter(isColor).sort();
    expect(Object.keys(darkMedia).sort()).toEqual(lightColors);
    expect(Object.keys(darkForced).sort()).toEqual(lightColors);
  });

  it("os dois blocos do tema escuro têm valores idênticos", () => {
    expect(darkForced).toEqual(darkMedia);
  });

  it("cada cor semântica tem utilitário Tailwind correspondente", () => {
    for (const token of Object.keys(light).filter(isColor)) {
      const name = token.replace("--ds-", "");
      expect(bridge).toContain(`--color-${name}: var(${token});`);
    }
  });

  it("inclui os tokens de chamada à acção accent e accent-foreground", () => {
    expect(light["--ds-accent"]).toBe("#f28c28");
    expect(light["--ds-accent-foreground"]).toBeDefined();
    expect(light["--ds-primary"]).toBe("#0b1f3a");
  });

  for (const [theme, tokens] of [
    ["claro", light],
    ["escuro", darkMedia],
  ] as const) {
    it.each(pairs)(`tema ${theme}: %s sobre %s cumpre WCAG AA (≥ %s:1)`, (fg, bg, min) => {
      const a = tokens[fg] ?? light[fg];
      const b = tokens[bg] ?? light[bg];
      expect(a, fg).toMatch(/^#[0-9a-f]{6}$/);
      expect(b, bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(a!, b!)).toBeGreaterThanOrEqual(min);
    });
  }

  it("superfícies navy usam anel de foco com contraste ≥ 3:1", () => {
    const ring = values(block('[data-tone="inverse"]'))["--ds-ring"]!;
    expect(contrast(ring, light["--ds-inverse"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(ring, darkMedia["--ds-inverse"]!)).toBeGreaterThanOrEqual(3);
  });
});
