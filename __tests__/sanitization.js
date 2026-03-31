const path = require("path");
const { spawn, sanitizers } = require("../src");

const defaultSanitizers = [...sanitizers];

beforeEach(() => {
  sanitizers.length = 0;
  sanitizers.push(...defaultSanitizers);
});

test("without cleaning", async () => {
  const run = spawn("node", [
    path.resolve(__dirname, "..", "__fixtures__", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.result).toMatchInlineSnapshot(`
{
  "code": 1,
  "error": null,
  "stderr": "/Users/suchipi/Code/first-base/__fixtures__/throw-error.js:1
throw new Error("oh no!");
^

Error: oh no!
    at Object.<anonymous> [90m(/Users/suchipi/Code/first-base/[39m__fixtures__/throw-error.js:1:7[90m)[39m
[90m    at Module._compile (node:internal/modules/cjs/loader:1761:14)[39m
[90m    at Object..js (node:internal/modules/cjs/loader:1893:10)[39m
[90m    at Module.load (node:internal/modules/cjs/loader:1481:32)[39m
[90m    at Module._load (node:internal/modules/cjs/loader:1300:12)[39m
[90m    at TracingChannel.traceSync (node:diagnostics_channel:328:14)[39m
[90m    at wrapModuleLoad (node:internal/modules/cjs/loader:245:24)[39m
[90m    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)[39m
[90m    at node:internal/main/run_main_module:33:47[39m

Node.js v24.13.0
",
  "stdout": "",
}
`);
});

test("with cleaning", async () => {
  const run = spawn("node", [
    path.resolve(__dirname, "..", "__fixtures__", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.cleanResult()).toMatchInlineSnapshot(`
{
  "code": 1,
  "error": null,
  "stderr": "<rootDir>/__fixtures__/throw-error.js
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
    path.resolve(__dirname, "..", "__fixtures__", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.cleanResult()).toMatchInlineSnapshot(`
{
  "code": 1,
  "error": null,
  "stderr": "<rootDir>/__fixtures__/throw-error.js
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
    path.resolve(__dirname, "..", "__fixtures__", "throw-error.js"),
  ]);
  await run.completion;
  expect(run.cleanResult()).toMatchInlineSnapshot(`
{
  "code": 1,
  "error": null,
  "stderr": "/Users/suchipi/Code/first-base/__fixtures__/throw-error.js:1
throw new Error("oh yes!");
^

Error: oh yes!
    at Object.<anonymous> [90m(/Users/suchipi/Code/first-base/[39m__fixtures__/throw-error.js:1:7[90m)[39m
[90m    at Module._compile (node:internal/modules/cjs/loader:1761:14)[39m
[90m    at Object..js (node:internal/modules/cjs/loader:1893:10)[39m
[90m    at Module.load (node:internal/modules/cjs/loader:1481:32)[39m
[90m    at Module._load (node:internal/modules/cjs/loader:1300:12)[39m
[90m    at TracingChannel.traceSync (node:diagnostics_channel:328:14)[39m
[90m    at wrapModuleLoad (node:internal/modules/cjs/loader:245:24)[39m
[90m    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)[39m
[90m    at node:internal/main/run_main_module:33:47[39m

Node.js v24.13.0
",
  "stdout": "",
}
`);
});
