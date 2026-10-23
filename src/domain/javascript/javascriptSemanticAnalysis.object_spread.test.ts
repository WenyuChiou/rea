import { expect, it } from "vitest";

import { analyzeJavaScriptSemantics } from "./javascriptSemanticAnalysis.js";
import { onlyCallable } from "./javascriptSemanticAnalysis.fixture.js";

const resultValue = (body: string) =>
  onlyCallable(
    analyzeJavaScriptSemantics(`export function result() { ${body} }`),
    "result",
  ).returnSites[0]?.value;

it.each([
  [
    "named source",
    "const source = { a: 1, b: 2 }; const copy = { ...source };",
    1,
  ],
  ["inline source", "const copy = { ...{ a: 1, b: 2 } };", 1],
  ["empty source", "const copy = { a: 1, ...{} };", 1],
  ["spread overwrites earlier field", "const copy = { a: 9, ...{ a: 1 } };", 1],
  ["later field overwrites spread", "const copy = { ...{ a: 1 }, a: 9 };", 9],
  ["later spread wins", "const copy = { ...{ a: 1 }, ...{ a: 9 } };", 9],
  [
    "known spread after unknown",
    "const copy = { ...dynamic, ...{ a: 1 } };",
    1,
  ],
  [
    "primitive copy before source escape",
    "const source = { a: 1 }; const copy = { ...source }; mutate(source);",
    1,
  ],
])("retains primitive object-spread values: %s", (_name, setup, value) => {
  expect(resultValue(`${setup} return copy.a;`)).toEqual({
    status: "literal",
    value,
  });
});

it.each([
  ["unknown source", "const copy = { ...dynamic };"],
  ["later unknown spread", "const copy = { ...{ a: 1 }, ...dynamic };"],
  [
    "accessor source",
    "const source = { get b() { this.a = 9; return 2; }, a: 1 }; const copy = { ...source };",
  ],
  ["setter source", "const copy = { ...{ a: 1, set b(value) {} } };"],
  ["unknown computed key", "const copy = { ...{ a: 1, [key]: 2 } };"],
  [
    "source escaped before copy",
    "const source = { a: 1 }; mutate(source); const copy = { ...source };",
  ],
  ["copy escaped", "const copy = { ...{ a: 1 } }; mutate(copy);"],
  [
    "source member write",
    "const source = { a: 1 }; const copy = { ...source }; source.a = 9;",
  ],
  ["copy member write", "const copy = { ...{ a: 1 } }; copy.a = 9;"],
  [
    "nested shared source",
    "const source = { a: 1, child: { value: 2 } }; const copy = { ...source }; mutate(source.child);",
  ],
  [
    "cyclic source",
    "const source = { ...source }; const copy = { ...source };",
  ],
])("retains uncertainty for unsupported object spreads: %s", (_name, setup) => {
  expect(resultValue(`${setup} return copy.a;`)?.status).toBe("unknown");
});

it("does not make a primitive source share its copy's mutations", () => {
  expect(
    resultValue(
      "const source = { a: 1 }; const copy = { ...source }; mutate(copy); return source.a;",
    ),
  ).toEqual({ status: "literal", value: 1 });
});

it("keeps later explicit fields known after an unsupported spread", () => {
  expect(
    resultValue("const copy = { ...{ child: {} }, a: 1 }; return copy.a;"),
  ).toEqual({ status: "literal", value: 1 });
});

it("retains a bounded primitive union copied through a spread", () => {
  expect(
    resultValue(
      "const source = { a: flag ? 1 : 9 }; const copy = { ...source }; return copy.a;",
    ),
  ).toEqual({ status: "union", values: [1, 9] });
});

it.each([true, null, "text"])(
  "copies primitive %j without coercion",
  (value) => {
    expect(
      resultValue(
        `const copy = { ...{ a: ${JSON.stringify(value)} } }; return copy.a;`,
      ),
    ).toEqual({ status: "literal", value });
  },
);

it("copies a computed __proto__ own slot without treating it as a prototype", () => {
  expect(
    resultValue(
      'const copy = { ...{ ["__proto__"]: 1 } }; return copy.__proto__;',
    ),
  ).toEqual({ status: "literal", value: 1 });
  expect(
    resultValue("const copy = { ...{ __proto__: null, a: 1 } }; return copy.a;")
      ?.status,
  ).toBe("unknown");
});

it("bounds nested object spread evaluation without losing a final explicit field", () => {
  const deep = "{ ...".repeat(300) + "{ a: 1 }" + " }".repeat(300);
  expect(
    resultValue(`const copy = { ...${deep}, a: 9 }; return copy.a;`),
  ).toEqual({ status: "literal", value: 9 });
});
