import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";

import { parseEvidence } from "../../../src/domain/evidence.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { cliTest } from "../../support/cli/cliFixture.js";

cliTest(
  "reports a changed primitive copied through an object spread via the public CLI",
  async ({ cli }) => {
    const root = await createTestTempDirectory("rea-object-spread-shapes-");
    const evidence = [];
    for (const [side, value] of [
      ["left", 1],
      ["right", 9],
    ] as const) {
      const directory = join(root, side);
      await mkdir(directory);
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ name: "fixture", version: "1.0.0", main: "index.js" }),
      );
      await writeFile(
        join(directory, "index.js"),
        `export default () => {
        const source = { a: ${value}, b: 2 };
        const copy = { ...source };
        return { type: "x", a: copy.a, b: copy.b };
      };`,
      );
      const response = await cli.run({
        arguments: ["analyze-javascript-application", directory, "--json"],
      });
      expect(response.exitCode, response.stderr).toBe(0);
      evidence.push(parseEvidence(response.json));
    }
    const [left, right] = evidence;
    if (left === undefined || right === undefined)
      throw new Error("Missing application Evidence");
    const request = join(root, "comparison.json");
    await writeFile(
      request,
      JSON.stringify({
        left,
        right,
        left_module_path: "index.js",
        right_module_path: "index.js",
        left_export_name: "default",
        right_export_name: "default",
      }),
    );
    const response = await cli.run({
      arguments: ["compare-javascript-export-shapes", request, "--json"],
    });
    expect(response.exitCode, response.stderr).toBe(0);
    const comparison = parseEvidence(response.json);
    expect(comparison.evidence_links).toEqual([
      left.evidence_id,
      right.evidence_id,
    ]);
    expect(comparison.normalized_result).toMatchObject({
      summary: { added: 0, removed: 0, changed: 1, unknown: 0 },
      changes: [
        expect.objectContaining({
          path: "/a",
          status: "changed",
          left: { availability: "literal", value: 1 },
          right: { availability: "literal", value: 9 },
        }),
      ],
    });
  },
  60_000,
);
