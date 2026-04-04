const normalSpawn = require("child_process").spawn;
const stripAnsi = require("strip-ansi");
const { sanitizers } = require("./sanitizers");

const allInflightRunContexts = new Set();

// Run a child process and return a "run context" object
// to interact with it. Function signature is the same as
// child_process spawn, except you can pass `pty: true` in
// options to run the process in a psuedo-tty.
const spawn = (cmd, argsOrOptions, passedOptions) => {
  let args;
  let options;
  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
  } else if (typeof argsOrOptions === "object") {
    options = argsOrOptions;
  }
  if (passedOptions && !options) {
    options = passedOptions;
  }
  if (!args) {
    args = [];
  }
  if (!options) {
    options = {};
  }

  let child;
  let stdin;
  let stdout;
  let stderr;
  let unreffable;
  let running;

  let debug = false;
  let outputContainsBuffer = "";
  let pendingOutputContainsRequests = new Set();
  const disposables = [];

  const debugLog = (...msg) => {
    if (debug) {
      console.log(...msg);
    }
  };

  const runContext = {
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
    completion: null,

    debug() {
      debug = true;
      return this;
    },

    // Returns a Promise that resolves once the child process output
    // (combined stdout and stderr) contains the passed string or
    // matches the passed RegExp. Ignores ansi control characters.
    outputContains(value) {
      debugLog(`Waiting for output to contain ${JSON.stringify(value)}...`);
      return new Promise((resolve, reject) => {
        const request = { value };
        request.resolve = () => {
          pendingOutputContainsRequests.delete(request);
          resolve();
        };
        request.reject = (error) => {
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
          stdin.end();
          break;
        }
        case "stdout": {
          stdout.destroy();
          break;
        }
        case "stderr": {
          stderr.destroy();
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
    kill(signal = "SIGINT") {
      if (running) {
        child.kill(signal);
      }
      if (unreffable) {
        unreffable.unref();
      }
    },
  };

  if (options.pty) {
    const ptySpawn = require("@lydell/node-pty").spawn;
    child = ptySpawn(cmd, args, options);
    stdin = child;
    stdout = child;
    stderr = null; // no way to tell between stdout and stderr with pty
    unreffable = child.socket;
  } else {
    child = normalSpawn(cmd, args, options);
    stdin = child.stdin;
    stdout = child.stdout;
    stderr = child.stderr;
    unreffable = child;
  }
  running = true;
  allInflightRunContexts.add(runContext);

  child.on("spawn", () => {
    debugLog("'spawn' event");
  });

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

  stdout.setEncoding("utf-8");

  const handleStdoutData = (data) => {
    runContext.result.stdout += data;
    outputContainsBuffer += data;
    debugLog(`STDOUT: ${data.toString()}`);
    checkForPendingOutputRequestsToResolve();
  };

  if (stdout.onData) {
    // the pty instance returned by node-pty
    // requires attaching handlers differently
    stdout.onData(handleStdoutData);
  } else {
    stdout.on("data", handleStdoutData);
  }

  if (stderr) {
    stderr.setEncoding("utf-8");

    // this is never a pty instance,
    // so we don't need to deal with onData here:
    stderr.on("data", (data) => {
      runContext.result.stderr += data;
      outputContainsBuffer += data;
      debugLog(`STDERR: ${data.toString()}`);
      checkForPendingOutputRequestsToResolve();
    });
  }

  runContext.completion = new Promise((resolve) => {
    let hasFinished = false;
    const finish = (reason) => {
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

    child.on("close", (code, signal) => {
      debugLog("'close' event", { code, signal });

      if (code != null) {
        runContext.result.code = code;
      }
    });

    if (child.onExit) {
      const disposable = child.onExit(({ exitCode, signal }) => {
        debugLog("onExit", { exitCode, signal });

        if (exitCode != null) {
          runContext.result.code = exitCode;
        }
        finish("exited");
      });
      disposables.push(disposable);
    } else {
      child.on("exit", (code) => {
        debugLog("'exit' event", { code });

        if (code != null) {
          runContext.result.code = code;
        }
        finish("exited");
      });
    }

    child.on("error", (error) => {
      debugLog("'error' event", { error });

      if (typeof error === "object" && error !== null && error.code === "EIO") {
        // not real; process is about to exit
        debugLog("Ignoring spurious EIO error:", error);
        return;
      }
      runContext.result.error = error;
      finish("errored");
    });
  });

  return runContext;
};

module.exports = { spawn, sanitizers, allInflightRunContexts };
