export type SpawnOptions = {
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
