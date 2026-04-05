import { spawn as normalSpawn, ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import stripAnsi from "strip-ansi";
import type { IPty, IDisposable } from "@lydell/node-pty";
import { sanitizers } from "./sanitizers";

export type Options = {
  cwd?: string;
  env?: { [varName: string]: string | undefined };
  argv0?: string;
  detached?: boolean;
  uid?: number;
  gid?: number;
  shell?: boolean | string;
  windowsVerbatimArguments?: boolean;
  windowsHide?: boolean;
  pty?: boolean;
  debug?: boolean;
};

export type RunContext = {
  result: {
    stdout: string;
    stderr: string;
    code: null | number;
    error: null | Error;
  };
  cleanResult(): {
    stdout: string;
    stderr: string;
    code: null | number;
    error: null | Error;
  };
  completion: Promise<void>;
  debug(): RunContext;
  outputContains(value: string | RegExp): Promise<void>;
  clearOutputContainsBuffer(): void;
  write(data: string | Buffer): void;
  close(stream: "stdin" | "stdout" | "stderr"): void;
  kill(signal?: NodeJS.Signals): void;
};

const allInflightRunContexts: Set<RunContext> = new Set();

// Run a child process and return a "run context" object
// to interact with it. Function signature is the same as
// child_process spawn, except you can pass `pty: true` in
// options to run the process in a psuedo-tty.
function spawn(cmd: string): RunContext;
function spawn(cmd: string, args: Array<string>): RunContext;
function spawn(cmd: string, options: Options): RunContext;
function spawn(cmd: string, args: Array<string>, options: Options): RunContext;
function spawn(
  cmd: string,
  argsOrOptions?: Array<string> | Options,
  passedOptions?: Options
): RunContext {
  let args: Array<string>;
  let options: Options;
  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
  } else if (typeof argsOrOptions === "object") {
    options = argsOrOptions;
  }
  if (passedOptions && !options!) {
    options = passedOptions;
  }
  if (!args!) {
    args = [];
  }
  if (!options!) {
    options = {};
  }

  let child: ChildProcess | IPty;
  let stdin: Writable | IPty;
  let stdout: Readable | IPty;
  let stderr: Readable | null;
  let unreffable: null | { unref(): void } = null;
  let running: boolean;

  let debug = options.debug ?? false;
  let outputContainsBuffer = "";
  let pendingOutputContainsRequests = new Set<{
    value: string | RegExp;
    resolve: () => void;
    reject: (error: Error) => void;
  }>();
  const disposables: Array<IDisposable> = [];

  const debugLog = (...msg: Array<any>) => {
    if (debug) {
      console.log(...msg);
    }
  };

  const runContext: RunContext = {
    result: {
      // All of the stdout and stderr the process has written so far.
      stdout: "",
      stderr: "",
      // Exit status code, if the process has finished.
      code: null,
      // if the process errored out, this will be the Error
      error: null,
    },

    // Return a version of result which has had the string sanitizers run on it
    cleanResult() {
      return Object.assign({}, runContext.result, {
        stdout: sanitizers.reduce(
          (str, transformFn) => transformFn(str),
          runContext.result.stdout
        ),
        stderr: sanitizers.reduce(
          (str, transformFn) => transformFn(str),
          runContext.result.stderr
        ),
      });
    },

    // Promise that gets resolved when the child process completes.
    // Actual value gets filled in below.
    completion: Promise.resolve(),

    debug() {
      debug = true;
      return this;
    },

    // Returns a Promise that resolves once the child process output
    // (combined stdout and stderr) contains the passed string or
    // matches the passed RegExp. Ignores ansi control characters.
    outputContains(value) {
      debugLog(`Waiting for output to contain ${JSON.stringify(value)}...`);
      return new Promise<void>((resolve, reject) => {
        const request: {
          value: string | RegExp;
          resolve: () => void;
          reject: (error: Error) => void;
        } = { value, resolve: undefined!, reject: undefined! };
        request.resolve = () => {
          pendingOutputContainsRequests.delete(request);
          resolve();
        };
        request.reject = (error: Error) => {
          pendingOutputContainsRequests.delete(request);
          reject(error);
        };
        pendingOutputContainsRequests.add(request);
      });
    },

    clearOutputContainsBuffer() {
      outputContainsBuffer = "";
    },

    // Call this function to write into stdin.
    write(data) {
      stdin.write(data);
    },

    // Call this function to close stdin, stdout, or stderr.
    close(stream) {
      switch (String(stream).toLowerCase()) {
        case "stdin": {
          if ("end" in stdin) {
            stdin.end();
          }
          break;
        }
        case "stdout": {
          if ("destroy" in stdout) {
            stdout.destroy();
          }
          break;
        }
        case "stderr": {
          if (stderr != null && "destroy" in stderr) {
            stderr.destroy();
          }
          break;
        }
        default: {
          throw new Error(
            `Invalid stream name: '${stream}'. Valid names are 'stdin', 'stdout', or 'stderr'.`
          );
        }
      }
    },

    // Call this function to send a signal to the child process.
    // You can pass "SIGTERM", "SIGKILL", etc. Defaults to "SIGINT".
    kill(signal: NodeJS.Signals = "SIGINT") {
      if (running) {
        child.kill(signal);
      }
      if (unreffable != null) {
        unreffable.unref();
      }
    },
  };

  if (options.pty) {
    debugLog("pty option was true; using node-pty");
    const ptySpawn: typeof import("@lydell/node-pty").spawn =
      require("@lydell/node-pty").spawn;
    const ptyChild = ptySpawn(cmd, args, options);
    child = ptyChild;
    stdin = ptyChild;
    stdout = ptyChild;
    stderr = null; // no way to tell between stdout and stderr with pty
    // no unreffable equivalent on ptyChild
  } else {
    debugLog("pty option was NOT true; using child_process");
    const nonPtyChild = normalSpawn(cmd, args, options);
    child = nonPtyChild;
    stdin = nonPtyChild.stdin;
    stdout = nonPtyChild.stdout;
    stderr = nonPtyChild.stderr;
    unreffable = nonPtyChild;
  }
  running = true;
  allInflightRunContexts.add(runContext);

  if ("on" in child) {
    debugLog("using 'on' method to listen for child spawn event");
    child.on("spawn", () => {
      debugLog("'spawn' event");
    });
  } else {
    debugLog(
      "child had no 'on' method, so child spawn event listener wasn't set up"
    );
  }

  const checkForPendingOutputRequestsToResolve = () => {
    pendingOutputContainsRequests.forEach((request) => {
      if (typeof request.value === "string") {
        if (stripAnsi(outputContainsBuffer).indexOf(request.value) != -1) {
          request.resolve();
        }
      } else if (request.value instanceof RegExp) {
        if (request.value.test(stripAnsi(outputContainsBuffer))) {
          request.resolve();
        }
      }
    });
  };

  if ("setEncoding" in stdout) {
    debugLog("setting stdout encoding to utf-8");
    stdout.setEncoding("utf-8");
  } else {
    debugLog(
      "not setting stdout encoding because the setEncoding method was not present"
    );
  }

  const handleStdoutData = (data: string) => {
    runContext.result.stdout += data;
    outputContainsBuffer += data;
    debugLog(`STDOUT: ${data.toString()}`);
    checkForPendingOutputRequestsToResolve();
  };

  if ("onData" in stdout) {
    debugLog("using 'onData' method to listen for stdout data event");
    // the pty instance returned by node-pty
    // requires attaching handlers differently
    stdout.onData(handleStdoutData);
  } else {
    debugLog("using 'on' method to listen for stdout data event");
    stdout.on("data", handleStdoutData);
  }

  if (stderr) {
    debugLog("setting stderr encoding to utf-8");
    stderr.setEncoding("utf-8");

    // this is never a pty instance,
    // so we don't need to deal with onData here:
    debugLog("using 'on' method to listen for stderr data event");
    stderr.on("data", (data: string) => {
      runContext.result.stderr += data;
      outputContainsBuffer += data;
      debugLog(`STDERR: ${data.toString()}`);
      checkForPendingOutputRequestsToResolve();
    });
  } else {
    debugLog(
      "stderr isn't present (pty mixes stdout and stderr together), so not setting encoding or setting up data event listener for stderr"
    );
  }

  runContext.completion = new Promise<void>((resolve) => {
    let hasFinished = false;
    const finish = (reason: string) => {
      debugLog("in finish", runContext.result);
      if (hasFinished) {
        debugLog("finish called more than once; ignoring");
      } else {
        running = false;
        allInflightRunContexts.delete(runContext);
        resolve();
        for (const request of pendingOutputContainsRequests) {
          request.reject(
            new Error(
              `Child process ${reason} before its output contained the requested content: ${request.value}`
            )
          );
        }
        for (const disposable of disposables) {
          disposable.dispose();
        }
        hasFinished = true;
      }
    };

    if ("on" in child) {
      debugLog("using 'on' method to listen for child close event");
      child.on("close", (code: number | null, signal: string | null) => {
        debugLog("'close' event", { code, signal });

        if (code != null) {
          runContext.result.code = code;
        }
      });
    } else {
      debugLog(
        "child had no 'on' method, so child close event listener wasn't set up"
      );
    }

    if ("onExit" in child) {
      debugLog("using 'onExit' method to listen for child exit event");
      const disposable = child.onExit(
        ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
          debugLog("onExit", { exitCode, signal });

          if (exitCode != null) {
            runContext.result.code = exitCode;
          }
          finish("exited");
        }
      );
      disposables.push(disposable);
    } else {
      debugLog("using 'on' method to listen for child exit event");
      child.on("exit", (code: number | null) => {
        debugLog("'exit' event", { code });

        if (code != null) {
          runContext.result.code = code;
        }
        finish("exited");
      });
    }

    if ("on" in child) {
      debugLog("using 'on' method to listen for child error event");
      child.on("error", (error: Error & { code?: string }) => {
        debugLog("'error' event", { error });

        if (
          typeof error === "object" &&
          error !== null &&
          error.code === "EIO"
        ) {
          // not real; process is about to exit
          debugLog("Ignoring spurious EIO error:", error);
          return;
        }
        runContext.result.error = error;
        finish("errored");
      });
    } else {
      debugLog(
        "child had no 'on' method, so child error event listener wasn't set up"
      );
    }
  });

  return runContext;
}

export { spawn, sanitizers, allInflightRunContexts };
