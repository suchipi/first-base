# `first-base`

Integration testing for CLI applications.

## Usage Example

```js
const { spawn } = require("first-base");

test("something", async () => {
  const run = spawn("node", ["-i"]); // launch node REPL
  await run.outputContains("> "); // wait until `> ` is logged
  run.write("2 + 2\n"); // enter `2 + 2` and press enter
  await run.outputContains("4"); // wait until `4` is logged
  run.kill(); // Ctrl+C
  await run.completion; // Wait until process exits
});
```

## API

### `spawn(command: string, args?: Array<string>, options?: Object) => RunContext`

`args` and `options` are the same as [child_process.spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options).

Returns a `RunContext` object; see below.

### `RunContext#result`

An object with the following properties on it:

- `stdout` (`string`): All the data the process has written to STDOUT so far
- `stderr` (`string`): All the data the process has written to STDERR so far
- `code` (`number | null`): Exit status code, if the process has finished
- `error` (`boolean`): If the process errored out, this is `true`

This object gets updated over time as the process runs.

#### Usage

```js
const run = spawn("ls", { cwd: __dirname });
console.log(run.result); // { stdout: '', stderr: '', code: null, error: false }
await run.completion;
console.log(run.result); // { stdout: 'README.md\npackage.json\nindex.js\n', stderr: '', code: 0, error: false }
```

### `RunContext#completion`

A Promise that gets resolved when the process completes. You can `await` it in your tests.

#### Usage

```js
const run = spawn("ls", { cwd: __dirname });
await run.completion; // Waits until the `ls` process finishes
```

### `RunContext#debug() => RunContext`

Enables debug logging for the `RunContext` and returns it. Useful when your tests are failing and you want to understand what's going on.

Returns itself so you can add it to a variable declaration easily.

#### Usage

```js
const run = spawn("ls", { cwd: __dirname }).debug();
// The following messages are logged to the console over time:
//
// STDOUT: README.md\npackage.json\nindex.js
// Process exited
// { stdout: 'README.md\npackage.json\nindex.js', stderr: '', code: 0, error: false }
```

### `RunContext#outputContains(value: string | RegExp) => Promise<void>`

Returns a Promise that will resolve once the process's output (combined STDOUT/STDERR) contains either the specified string or matches the specified RegExp. Ignores ANSI control characters.

#### Usage

```js
const run = spawn("node", ["-i"]); // start Node.js REPL
await run.outputContains("> "); // Wait until prompt appears
```

### `RunContext#clearOutputContainsBuffer()`

Clears the buffer of "seen" output as far as the `outputContains` method is concerned. Useful if the output already contains the specified value, and you want to wait until it appears a second time.

#### Usage

```js
const run = spawn("node", ["-i"]); // start Node.js REPL
await run.outputContains("> "); // Wait until prompt appears
run.write("2 + 2\n"); // Write 2 + 2 then press enter
run.clearOutputContainsBuffer();
await run.outputContains("> "); // Wait until prompt appears a second time. If we hadn't cleared the buffer, this would resolve immediately.
```

### `RunContext#write(data: string | Buffer)`

Write some data into the process's STDIN stream.

#### Usage

```js
const run = spawn("node", ["-i"]); // start Node.js REPL
await run.outputContains("> "); // Wait until prompt appears
run.write("2 + 2\n"); // Write 2 + 2 then press enter
await run.outputContains("4");
```

### `RunContext#close(stream: 'stdin' | 'stdout' | 'stderr')`

Close one of the processes's associated stdio streams.

#### Usage

```js
const run = spawn("node", ["-i"]); // start Node.js REPL
await run.outputContains("> "); // Wait until prompt appears
run.close("stdin"); // Like pressing Ctrl+D; sends EOF
await run.completion;
```

### `RunContext#kill(signal?: string)`

Kills the process. If no signal is specified, it defaults to `"SIGINT"`.

#### Usage

```js
const run = spawn("node", ["-i"]);
run.kill(); // Kill with SIGINT
// OR:
run.kill("SIGKILL"); // Kill with SIGKILL
```

## License

MIT
