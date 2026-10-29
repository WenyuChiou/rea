import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { estimateTokenCount } from "tokenx";
import { createMarkdownRenderer, disposeMdItInstance } from "vitepress";
import { afterAll, expect } from "vitest";

import { cliTest } from "../../support/cli/cliFixture.js";

afterAll(() => disposeMdItInstance());

cliTest(
  "renders complete validation choices in a Markdown table",
  async ({ cli }) => {
    const args = [
      "search",
      "./missing-input",
      "needle",
      "--kind",
      "unrecognized",
    ];
    const markdown = await cli.run({ arguments: [...args, "--format", "md"] });
    const full = await cli.run({
      arguments: [...args, "--format", "md", "--full-output"],
    });
    const count = await cli.run({
      arguments: [...args, "--format", "md", "--token-count"],
    });
    const window = await cli.run({
      arguments: [
        ...args,
        "--format",
        "md",
        "--full-output",
        "--token-limit",
        "20",
      ],
    });
    const json = await cli.run({ arguments: [...args, "--format", "json"] });
    expect(markdown.exitCode).toBe(1);
    expect(full.exitCode).toBe(1);
    expect(count.exitCode).toBe(1);
    expect(window.exitCode).toBe(1);
    expect(json.exitCode).toBe(1);
    expect(markdown.stderr).toBe("");
    expect(json.stderr).toBe("");
    const failure = JSON.parse(json.stdout);
    expect(failure.code).toBe("VALIDATION_ERROR");
    const message = failure.fieldErrors[0].message as string;
    expect(message).toContain('"strings"|"procedures"');

    const renderer = await createMarkdownRenderer(process.cwd(), {
      linkify: false,
    });
    const renderedCells = (output: string): string[] => {
      const cells: string[] = [];
      const visit = (node: DefaultTreeAdapterTypes.Node): void => {
        if ("tagName" in node && node.tagName === "td") {
          const text = (child: DefaultTreeAdapterTypes.Node): string =>
            child.nodeName === "#text" && "value" in child
              ? child.value
              : "childNodes" in child
                ? child.childNodes.map(text).join("")
                : "";
          cells.push(text(node));
        } else if ("childNodes" in node) node.childNodes.forEach(visit);
      };
      visit(parseFragment(renderer.render(output)));
      return cells;
    };
    expect(renderedCells(markdown.stdout)).toContain(message);
    expect(renderedCells(full.stdout)).toContain(message);
    expect(Number(count.stdout.trim())).toBe(
      estimateTokenCount(markdown.stdout.trimEnd()),
    );
    expect(window.stdout).toContain("[truncated: showing tokens 0–20 of ");
    expect(window.stdout).toContain("nextOffset");

    // A different parser error has a much longer enum. Compare the visible
    // cell with the unmodified machine-readable diagnostic, not a subset.
    const doctorArgs = ["doctor", "--client", "x|y"];
    const doctorMd = await cli.run({
      arguments: [...doctorArgs, "--format", "md"],
    });
    const doctorJson = await cli.run({
      arguments: [...doctorArgs, "--format", "json"],
    });
    expect(doctorMd.exitCode).toBe(1);
    expect(doctorJson.exitCode).toBe(1);
    const doctorMessage = JSON.parse(doctorJson.stdout).fieldErrors[0]
      .message as string;
    expect(doctorMessage.split("|").length).toBeGreaterThan(2);
    expect(renderedCells(doctorMd.stdout)).toContain(doctorMessage);
  },
);
