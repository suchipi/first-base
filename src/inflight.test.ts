import { test, expect } from "vitest";
import { spawn, allInflightRunContexts } from "./index";

test("one run", async () => {
  const run1 = spawn("sleep", ["1"]);
  expect(allInflightRunContexts).toContain(run1);
  await run1.completion;
  expect(allInflightRunContexts).not.toContain(run1);
});

test("multiple runs", async () => {
  const run1 = spawn("sleep", ["0.2"]);
  const run2 = spawn("sleep", ["0.4"]);
  const run3 = spawn("sleep", ["0.6"]);
  expect(allInflightRunContexts).toContain(run1);
  expect(allInflightRunContexts).toContain(run2);
  expect(allInflightRunContexts).toContain(run3);

  run3.kill();
  // wait for kill to go through...
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(allInflightRunContexts).toContain(run1);
  expect(allInflightRunContexts).toContain(run2);
  expect(allInflightRunContexts).not.toContain(run3);

  await run1.completion;
  expect(allInflightRunContexts).not.toContain(run1);
  expect(allInflightRunContexts).toContain(run2);
  expect(allInflightRunContexts).not.toContain(run3);

  await run2.completion;
  expect(allInflightRunContexts).not.toContain(run1);
  expect(allInflightRunContexts).not.toContain(run2);
  expect(allInflightRunContexts).not.toContain(run3);
});
