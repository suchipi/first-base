import path from "path";
import { test, expect, beforeEach } from "vitest";
import { spawn, sanitizers } from "./index";

const defaultSanitizers = [...sanitizers];

beforeEach(() => {
  sanitizers.length = 0;
  sanitizers.push(...defaultSanitizers);
});

test("without cleaning", async () => {
  const run = spawn("node", [
    path.resolve(__dirname, "..", "test-fixtures", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.result).toMatchInlineSnapshot(`
    {
      "code": 1,
      "error": null,
      "stderr": "/Users/suchipi/Code/first-base/test-fixtures/throw-error.js:1
    throw new Error("oh no!");
    ^

    Error: oh no!
        at Object.<anonymous> (/Users/suchipi/Code/first-base/test-fixtures/throw-error.js:1:7)
        at Module._compile (node:internal/modules/cjs/loader:1761:14)
        at Object..js (node:internal/modules/cjs/loader:1893:10)
        at Module.load (node:internal/modules/cjs/loader:1481:32)
        at Module._load (node:internal/modules/cjs/loader:1300:12)
        at TracingChannel.traceSync (node:diagnostics_channel:328:14)
        at wrapModuleLoad (node:internal/modules/cjs/loader:245:24)
        at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
        at node:internal/main/run_main_module:33:47

    Node.js v24.13.0
    ",
      "stdout": "",
    }
  `);
});

test("with cleaning", async () => {
  const run = spawn("node", [
    path.resolve(__dirname, "..", "test-fixtures", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.cleanResult()).toMatchInlineSnapshot(`
{
  "code": 1,
  "error": null,
  "stderr": "<rootDir>/test-fixtures/throw-error.js
throw new Error("oh no!");
^

Error: oh no!
    at somewhere

Node.js v24.13.0
",
  "stdout": "",
}
`);
});

test("adding a custom sanitizer", async () => {
  sanitizers.push((str) => str.replaceAll("oh no", "oh yes"));

  const run = spawn("node", [
    path.resolve(__dirname, "..", "test-fixtures", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.cleanResult()).toMatchInlineSnapshot(`
{
  "code": 1,
  "error": null,
  "stderr": "<rootDir>/test-fixtures/throw-error.js
throw new Error("oh yes!");
^

Error: oh yes!
    at somewhere

Node.js v24.13.0
",
  "stdout": "",
}
`);
});

test("without the default sanitizers", async () => {
  sanitizers.length = 0;
  sanitizers.push((str) => str.replaceAll("oh no", "oh yes"));

  const run = spawn("node", [
    path.resolve(__dirname, "..", "test-fixtures", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.cleanResult()).toMatchInlineSnapshot(`
    {
      "code": 1,
      "error": null,
      "stderr": "/Users/suchipi/Code/first-base/test-fixtures/throw-error.js:1
    throw new Error("oh yes!");
    ^

    Error: oh yes!
        at Object.<anonymous> (/Users/suchipi/Code/first-base/test-fixtures/throw-error.js:1:7)
        at Module._compile (node:internal/modules/cjs/loader:1761:14)
        at Object..js (node:internal/modules/cjs/loader:1893:10)
        at Module.load (node:internal/modules/cjs/loader:1481:32)
        at Module._load (node:internal/modules/cjs/loader:1300:12)
        at TracingChannel.traceSync (node:diagnostics_channel:328:14)
        at wrapModuleLoad (node:internal/modules/cjs/loader:245:24)
        at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
        at node:internal/main/run_main_module:33:47

    Node.js v24.13.0
    ",
      "stdout": "",
    }
  `);
});
