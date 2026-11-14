import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as columns from "./columns";

const M3 = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113212446_portal_api.sql"),
  "utf8",
);

const lists: [string, string][] = Object.entries(columns as Record<string, unknown>).flatMap(
  ([name, value]) => (typeof value === "string" ? [[name, value] as [string, string]] : []),
);

describe("listas de colunas", () => {
  it("nenhuma usa * nem evidence_ref", () => {
    expect(lists.length).toBeGreaterThan(0);
    for (const [name, list] of lists) {
      const names = columns.columnNames(list);
      expect(names, name).not.toContain("*");
      expect(names, name).not.toContain("evidence_ref");
      expect(new Set(names).size, name).toBe(names.length);
      for (const column of names) expect(column, name).toMatch(/^[a-z_]+$/);
    }
  });

  it("ticket_events: exactamente as nove colunas concedidas pela M3", () => {
    const grant = M3.match(/grant select \(([^)]+)\)\s*on table public\.ticket_events/);
    expect(grant).not.toBeNull();
    const granted = grant![1].split(",").map((s) => s.trim());
    expect(granted).toHaveLength(9);
    expect(columns.columnNames(columns.TICKET_EVENT_COLUMNS)).toEqual(granted);
    expect([...columns.TICKET_EVENT_COLUMN_NAMES]).toEqual(granted);
  });
});
