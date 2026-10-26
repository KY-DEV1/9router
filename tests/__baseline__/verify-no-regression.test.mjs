import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailures, normalizeTestPath, readKnownFails, repoRoot } from "./verify-no-regression.mjs";

const testFile = "tests/unit/example.test.js";

test("normalizes POSIX, Windows, and relative result paths to repo-relative paths", () => {
  assert.equal(normalizeTestPath(`${repoRoot}/${testFile}`), testFile);
  assert.equal(normalizeTestPath(`${repoRoot.replaceAll("/", "\\")}\\${testFile.replaceAll("/", "\\")}`), testFile);
  assert.equal(normalizeTestPath(`C:${repoRoot.replaceAll("/", "\\")}\\${testFile.replaceAll("/", "\\")}`), testFile);
  assert.equal(normalizeTestPath(testFile.replaceAll("/", "\\")), testFile);
  assert.equal(normalizeTestPath(`9router/${testFile}`), testFile);
});

test("ignores blank and comment lines in known-fails", () => {
  const knownFails = readKnownFails();
  assert.equal([...knownFails].some(line => !line || line.startsWith("#")), false);
  assert.equal(knownFails.has("tests/unit/security-audit.test.js :: AUDIT-002: API key masking byApiKey object keys should use masked key, not raw key"), true);
});

test("separates known failures from regressions and ignores non-failure assertions", () => {
  const results = {
    testResults: [
      {
        name: `${repoRoot.replaceAll("/", "\\")}\\${testFile.replaceAll("/", "\\")}`,
        assertionResults: [
          { status: "failed", fullName: "known failure" },
          { status: "passed", fullName: "passing test" },
          { status: "failed", fullName: "new regression" },
        ],
      },
    ],
  };
  const { nowFails, known, regressions } = classifyFailures(results, new Set([`${testFile} :: known failure`])) ;
  assert.deepEqual(nowFails, [`${testFile} :: known failure`, `${testFile} :: new regression`]);
  assert.deepEqual(known, [`${testFile} :: known failure`]);
  assert.deepEqual(regressions, [`${testFile} :: new regression`]);
});

test("includes suite-load failures that have no assertion results", () => {
  const results = {
    testResults: [
      { name: `${repoRoot}/${testFile}`, status: "failed", assertionResults: [], message: "Cannot load module" },
    ],
  };
  const key = `${testFile} :: <suite failed to load>`;
  const { nowFails, known, regressions } = classifyFailures(results, new Set([key]));
  assert.deepEqual(nowFails, [key]);
  assert.deepEqual(known, [key]);
  assert.deepEqual(regressions, []);
});
