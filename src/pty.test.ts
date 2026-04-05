import stripAnsi from "strip-ansi";
import { describe, test, expect, vi } from "vitest";
import { spawn } from "./index";

describe("spawn with pty", () => {
  test("process.stdout.isTTY is true in pty mode", async () => {
    const run = spawn("node", ["-p", "process.stdout.isTTY"], { pty: true });
    await run.completion;
    expect(stripAnsi(run.result.stdout.trim())).toEqual("true");
  });

  test("process.stderr is null (pty merges stdout and stderr)", async () => {
    const run = spawn(
      "node",
      ["-e", "console.log('out'); console.error('err');"],
      { pty: true }
    );
    await run.completion;
    // In pty mode, stderr is null so everything goes through stdout
    expect(run.result.stderr).toEqual("");
    const output = stripAnsi(run.result.stdout);
    expect(output).toContain("out");
    expect(output).toContain("err");
  });

  test("exit code is captured", async () => {
    const run = spawn("node", ["-e", "process.exit(42)"], { pty: true });
    await run.completion;
    expect(run.result.code).toEqual(42);
  });

  test("exit code 0 on success", async () => {
    const run = spawn("node", ["-e", "console.log('ok')"], { pty: true });
    await run.completion;
    expect(run.result.code).toEqual(0);
  });

  test("outputContains works with pty", async () => {
    const run = spawn("node", ["-i"], { pty: true });
    await run.outputContains("> ");
    run.write("2 + 2\n");
    await run.outputContains("4");
    run.kill();
    await run.completion;
  });

  test("outputContains with RegExp works with pty", async () => {
    const run = spawn("node", ["-i"], { pty: true });
    await run.outputContains(/>\s/);
    run.write("'hello'.toUpperCase()\n");
    await run.outputContains(/HELLO/);
    run.kill();
    await run.completion;
  });

  test("clearOutputContainsBuffer works with pty", async () => {
    const run = spawn("node", ["-i"], { pty: true });
    await run.outputContains("> ");
    run.write("1 + 1\n");
    await run.outputContains("2");
    run.clearOutputContainsBuffer();
    run.write("3 + 3\n");
    await run.outputContains("6");
    run.kill();
    await run.completion;
  });

  test("write sends input to pty process", async () => {
    const run = spawn("node", ["-i"], { pty: true });
    await run.outputContains("> ");
    run.write("'foo' + 'bar'\n");
    await run.outputContains("foobar");
    run.kill();
    await run.completion;
    expect(stripAnsi(run.result.stdout)).toContain("foobar");
  });

  test("kill terminates pty process", async () => {
    const run = spawn("node", ["-i"], { pty: true });
    await run.outputContains("> ");
    run.kill();
    await run.completion;
    // Process should have finished after kill
    expect(run.result.code).not.toBeNull();
  });

  test("cleanResult applies sanitizers in pty mode", async () => {
    const run = spawn("node", ["-e", "console.log('hello')"], { pty: true });
    await run.completion;
    const clean = run.cleanResult();
    // cleanResult should return an object with stdout, stderr, code, error
    expect(clean).toHaveProperty("stdout");
    expect(clean).toHaveProperty("stderr");
    expect(clean).toHaveProperty("code");
    expect(clean).toHaveProperty("error");
  });

  test("error from pty process is captured", async () => {
    const run = spawn("node", ["test-fixtures/throw-error.js"], { pty: true });
    await run.completion;
    const output = stripAnsi(run.result.stdout);
    expect(output).toContain("oh no!");
    expect(run.result.code).not.toEqual(0);
  });

  test("environment variables are passed through in pty mode", async () => {
    const run = spawn("node", ["-p", "process.env.FIRST_BASE_TEST_VAR"], {
      pty: true,
      env: Object.assign({}, process.env, { FIRST_BASE_TEST_VAR: "hello123" }),
    });
    await run.completion;
    expect(stripAnsi(run.result.stdout)).toContain("hello123");
  });

  test("multiple pty processes can run concurrently", async () => {
    const run1 = spawn("node", ["-e", "console.log('proc1')"], { pty: true });
    const run2 = spawn("node", ["-e", "console.log('proc2')"], { pty: true });
    await Promise.all([run1.completion, run2.completion]);
    expect(stripAnsi(run1.result.stdout)).toContain("proc1");
    expect(stripAnsi(run2.result.stdout)).toContain("proc2");
  });

  test("debug logs to console in pty mode", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const run = spawn("node", ["-e", "console.log(2 + 2)"], {
        pty: true,
        debug: true,
      });
      await run.completion;
      expect(spy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "pty option was true; using node-pty",
          ],
          [
            "using 'on' method to listen for child spawn event",
          ],
          [
            "setting stdout encoding to utf-8",
          ],
          [
            "using 'onData' method to listen for stdout data event",
          ],
          [
            "stderr isn't present (pty mixes stdout and stderr together), so not setting encoding or setting up data event listener for stderr",
          ],
          [
            "using 'on' method to listen for child close event",
          ],
          [
            "using 'onExit' method to listen for child exit event",
          ],
          [
            "using 'on' method to listen for child error event",
          ],
          [
            "STDOUT: [33m4[39m
        ",
          ],
          [
            "'close' event",
            {
              "code": undefined,
              "signal": undefined,
            },
          ],
          [
            "onExit",
            {
              "exitCode": 0,
              "signal": 0,
            },
          ],
          [
            "in finish",
            {
              "code": 0,
              "error": null,
              "stderr": "",
              "stdout": "[33m4[39m
        ",
            },
          ],
        ]
      `);
    } finally {
      spy.mockRestore();
    }
  });

  test("outputContains rejects when pty process exits before match", async () => {
    const run = spawn("node", ["-e", "void 0"], { pty: true });
    const promise = run.outputContains("this will never appear");
    await run.completion;
    await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Child process exited before its output contained the requested content: this will never appear]`
    );
  });

  test("kill with custom signal in pty mode", async () => {
    const run = spawn(
      "node",
      [
        "-e",
        `
        process.on("SIGTERM", () => {
          process.stdout.write("got_sigterm");
          process.exit(0);
        });
        console.log("ready");
        setTimeout(() => {}, 5000);
      `,
      ],
      { pty: true }
    );
    await run.outputContains("ready");
    run.kill("SIGTERM");
    await run.outputContains("got_sigterm");
    await run.completion;
    expect(stripAnsi(run.result.stdout)).toContain("got_sigterm");

    const run2 = spawn(
      "node",
      [
        "-e",
        `
        process.on("SIGINT", () => {
          process.stdout.write("got_sigint");
          process.exit(0);
        });
        console.log("ready");
        setTimeout(() => {}, 5000);
      `,
      ],
      { pty: true }
    );
    await run2.outputContains("ready");
    run2.kill("SIGINT");
    await run2.outputContains("got_sigint");
    await run2.completion;
    expect(stripAnsi(run2.result.stdout)).toContain("got_sigint");
  });

  test("kill after pty process already exited does not throw", async () => {
    const run = spawn("node", ["-e", "console.log('done')"], { pty: true });
    await run.completion;
    expect(() => {
      run.kill();
    }).not.toThrow();
  });
});
