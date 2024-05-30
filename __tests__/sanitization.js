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
  "error": false,
  "stderr": "/Users/suchipi/Code/first-base/__fixtures__/throw-error.js:1
throw new Error("oh no!");
^

Error: oh no!
    at Object.<anonymous> (/Users/suchipi/Code/first-base/__fixtures__/throw-error.js:1:7)
    at Module._compile (node:internal/modules/cjs/loader:1376:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1435:10)
    at Module.load (node:internal/modules/cjs/loader:1207:32)
    at Module._load (node:internal/modules/cjs/loader:1023:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:135:12)
    at node:internal/main/run_main_module:28:49

Node.js v20.11.1
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
      "error": false,
      "stderr": "<rootDir>/__fixtures__/throw-error.js
    throw new Error("oh no!");
    ^

    Error: oh no!
        at somewhere

    Node.js v20.11.1
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
      "error": false,
      "stderr": "<rootDir>/__fixtures__/throw-error.js
    throw new Error("oh yes!");
    ^

    Error: oh yes!
        at somewhere

    Node.js v20.11.1
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
  "error": false,
  "stderr": "/Users/suchipi/Code/first-base/__fixtures__/throw-error.js:1
throw new Error("oh yes!");
^

Error: oh yes!
    at Object.<anonymous> (/Users/suchipi/Code/first-base/__fixtures__/throw-error.js:1:7)
    at Module._compile (node:internal/modules/cjs/loader:1376:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1435:10)
    at Module.load (node:internal/modules/cjs/loader:1207:32)
    at Module._load (node:internal/modules/cjs/loader:1023:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:135:12)
    at node:internal/main/run_main_module:28:49

Node.js v20.11.1
",
  "stdout": "",
}
`);
});
