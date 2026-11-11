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

function declared(body: string, prefix: string): string[] {
  return [...body.matchAll(new RegExp(`(${prefix}[a-z-]+)\\s*:`, "g"))].map((m) => m[1]!).sort();
}

const light = declared(block(":root {"), "--ds-");
const darkMedia = declared(block(':root:not([data-theme="light"])'), "--ds-");
const darkForced = declared(block(':root[data-theme="dark"]'), "--ds-");
const bridge = block("@theme inline");

describe("design tokens", () => {
  it("o tema escuro (sistema e forçado) redefine as mesmas cores do tema claro", () => {
    const lightColors = light.filter((t) => !t.startsWith("--ds-ring-"));
    expect(darkMedia).toEqual(lightColors);
    expect(darkForced).toEqual(lightColors);
  });

  it("cada cor semântica tem utilitário Tailwind correspondente", () => {
    for (const token of light.filter((t) => !t.startsWith("--ds-ring-"))) {
      const name = token.replace("--ds-", "");
      expect(bridge).toContain(`--color-${name}: var(${token});`);
    }
  });
});
