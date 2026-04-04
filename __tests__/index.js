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
      error: null,
    });
  });

  test("debug logs to console", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const run = spawn("node", [
        "-e",
        "process.stdout.write('hi'); process.stderr.write('bye')",
      ]).debug();
      await run.completion;
      expect(spy).toHaveBeenCalledWith("'spawn' event");
      expect(spy).toHaveBeenCalledWith("STDOUT: hi");
      expect(spy).toHaveBeenCalledWith("STDERR: bye");
      expect(spy).toHaveBeenCalledWith("'exit' event", { code: 0 });
      expect(spy).toHaveBeenCalledWith("in finish", run.result);
    } finally {
      spy.mockRestore();
    }
  });

  test("debug logs outputContains", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const run = spawn("node", ["-e", "console.log('hello')"]).debug();
      await run.outputContains("hello");
      await run.completion;
      expect(spy).toHaveBeenCalledWith(
        'Waiting for output to contain "hello"...'
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("outputContains", async () => {
    const run = spawn("node", ["-i"]);
    await run.outputContains("> ");
    run.write("2 + 2\n");
    await run.outputContains("4");
    run.kill();
    await run.completion;
  });

  test("outputContains with RegExp", async () => {
    const run = spawn("node", ["-i"]);
    await run.outputContains(/>\s/);
    run.write("'abc'.toUpperCase()\n");
    await run.outputContains(/ABC/);
    run.kill();
    await run.completion;
    expect(run.result.stdout).toContain("> 'ABC'\n> ");
  });

  test("outputContains rejects when process exits before match", async () => {
    const run = spawn("node", ["-e", "setTimeout(() => process.exit(0), 100)"]);
    const promise = run.outputContains("this will never appear");
    await run.completion;
    await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Child process exited before its output contained the requested content: this will never appear"`
    );
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

  test("close stdin", async () => {
    const run = spawn("node", ["-i"]);
    await run.outputContains("> ");
    run.write("2 + 2\n");
    await run.outputContains("4");
    run.close("stdin");
    await run.completion;
  });

  test("close stdout", async () => {
    const run = spawn("bash", [
      "-c",
      `
        # on EPIPE, write to stderr
        trap "echo stdout_closed >&2; exit 0" PIPE
        while true; do
          echo waiting...
          sleep 0.5
        done
      `,
    ]);
    await run.outputContains("waiting...");
    run.close("stdout");
    await run.outputContains("stdout_closed");
    await run.completion;
    expect(run.result.stderr).toContain("stdout_closed");
  });

  test("close stderr", async () => {
    const run = spawn("bash", [
      "-c",
      `
        # on EPIPE, write to stdout
        trap "echo stderr_closed; exit 0" PIPE
        while true; do
          echo waiting >&2
          sleep 0.5
        done
      `,
    ]);
    await run.outputContains("waiting");
    run.close("stderr");
    await run.outputContains("stderr_closed");
    await run.completion;
    expect(run.result.stdout).toContain("stderr_closed");
  });

  test("close with invalid stream name throws", () => {
    const run = spawn("node", ["-e", "setTimeout(() => {}, 500)"]);
    expect(() => run.close("bogus")).toThrow(
      "Invalid stream name: 'bogus'. Valid names are 'stdin', 'stdout', or 'stderr'."
    );
    run.kill();
  });

  test("kill with custom signal", async () => {
    const run = spawn("node", [
      "-e",
      `
        process.on("SIGTERM", () => {
          process.stderr.write("got_sigterm");
          process.exit(0);
        });
        console.log("ready");
        setTimeout(() => {}, 5000);
      `,
    ]);
    await run.outputContains("ready");
    run.kill("SIGTERM");
    await run.completion;
    expect(run.result.stderr).toContain("got_sigterm");

    const run2 = spawn("node", [
      "-e",
      `
        process.on("SIGINT", () => {
          process.stderr.write("got_sigint");
          process.exit(0);
        });
        console.log("ready");
        setTimeout(() => {}, 5000);
      `,
    ]);
    await run2.outputContains("ready");
    run2.kill("SIGINT");
    await run2.completion;
    expect(run2.result.stderr).toContain("got_sigint");
  });

  test("kill after process already exited does not throw", async () => {
    const run = spawn("node", ["-e", "console.log('done')"]);
    await run.completion;
    expect(() => {
      run.kill();
    }).not.toThrow();
  });

  test("spawn with no args", async () => {
    const run = spawn("echo");
    await run.completion;
    expect(run.result.code).toBe(0);
    expect(run.result.stdout).toBe("\n");
  });

  test("spawn with options as second argument", async () => {
    const run = spawn("env", {
      env: Object.assign({ HI: "yes" }),
    });
    await run.completion;
    expect(run.result).toMatchInlineSnapshot(`
      {
        "code": 0,
        "error": null,
        "stderr": "",
        "stdout": "HI=yes
      ",
      }
    `);
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
