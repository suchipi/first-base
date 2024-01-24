const normalSpawn = require("child_process").spawn;
const ptySpawn = require("node-pty").spawn;
const stripAnsi = require("strip-ansi");

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
      // true if the process errored out
      error: false,
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
        request.reject = () => {
          pendingOutputContainsRequests.delete(request);
          reject();
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
          stdout.end();
          break;
        }
        case "stderr": {
          stderr.end();
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
    const finish = (reason) => {
      debugLog(`Process ${reason}`);
      debugLog(runContext.result);
      running = false;
      resolve();
      pendingOutputContainsRequests.forEach((request) => {
        request.reject(
          new Error(
            `Child process ${reason} before its output contained the requested content: ${request.value}`
          )
        );
      });
    };

    child.once("exit", (code) => {
      runContext.result.code = code;
      finish("exited");
    });

    child.once("error", () => {
      runContext.result.error = true;
      finish("errored");
    });
  });

  return runContext;
};

module.exports = { spawn };
