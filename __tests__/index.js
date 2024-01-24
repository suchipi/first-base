const stripAnsi = require("strip-ansi");
const { spawn } = require("../src");

describe("spawn", () => {
  test("result", async () => {
    const run = spawn("node", [
      "-e",
      "console.log('hi'); console.error('there');",
    ]);
    await run.completion;
    expect(run.result).toEqual({
      stdout: "hi\n",
      stderr: "there\n",
      code: 0,
      error: false,
    });
  });

  test("debug", async () => {
    const run = spawn("node", [
      "-e",
      "process.stdout.write('hi'); process.stderr.write('hi')",
    ]).debug();
    await run.completion;
  });

  test("outputContains", async () => {
    const run = spawn("node", ["-i"]);
    await run.outputContains("> ");
    run.write("2 + 2\n");
    await run.outputContains("4");
    run.kill();
    await run.completion;
  });

  test("clearOutputContainsBuffer", async () => {
    const run = spawn("node", ["-i"]);
    await run.outputContains("> ");
    run.write("2 + 2\n");
    await run.outputContains("4");
    run.clearOutputContainsBuffer();
    run.write("\n");
    await run.outputContains("> ");
    run.kill();
    await run.completion;
  });

  test("close", async () => {
    const run = spawn("node", ["-i"]);
    await run.outputContains("> ");
    run.write("2 + 2\n");
    await run.outputContains("4");
    run.close("stdin");
    await run.completion;
  });

  test("pty", async () => {
    const cleanOutput = (run) => stripAnsi(run.result.stdout.trim());

    const run1 = spawn("node", ["-p", "process.stdout.isTTY"]);
    await run1.completion;
    expect(cleanOutput(run1)).toEqual("undefined");

    const run2 = spawn("node", ["-p", "process.stdout.isTTY"], { pty: true });
    await run2.completion;
    expect(cleanOutput(run2)).toEqual("true");
  });
});
