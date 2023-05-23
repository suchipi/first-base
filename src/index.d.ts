export type Options = {
  cwd?: string;
  env?: { [varName: string]: any };
  argv0?: string;
  detached?: boolean;
  uid?: number;
  gid?: number;
  shell?: boolean | string;
  windowsVerbatimArguments?: boolean;
  windowsHide?: boolean;
};

export type RunContext = {
  result: {
    stdout: string;
    stderr: string;
    code: null | number;
    error: boolean;
  };
  completion: Promise<void>;
  debug(): RunContext;
  outputContains(value: string | RegExp): Promise<void>;
  clearOutputContainsBuffer(): void;
  // TODO: Should be string | Buffer, but idk how to use Buffer since they might not be using node types
  write(data: any): void;
  close(stream: "stdin" | "stdout" | "stderr"): void;
  kill(signal?: string): void;
};

export const spawn: ((cmd: string) => RunContext) &
  ((cmd: string, args: Array<string>) => RunContext) &
  ((cmd: string, options: Options) => RunContext) &
  ((cmd: string, args: Array<string>, options: Options) => RunContext);
