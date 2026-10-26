// Gate: compare current test results with the known-fails baseline.
// PASS if no test that was expected to pass now fails. New tests are allowed.
// Usage: node tests/__baseline__/verify-no-regression.mjs <current-results.json>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, posix, relative, resolve, win32 } from "node:path";

const baselineDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(baselineDir, "../..");

/** Convert a Vitest/Jest result path to a path relative to this repository. */
export function normalizeTestPath(filePath, root = repoRoot) {
  if (typeof filePath !== "string" || !filePath.trim()) return "";

  const input = filePath.trim().replaceAll("\\", "/");
  const normalizedRoot = posix.normalize(root.replaceAll("\\", "/")).replace(/\/$/, "");
  const rootSegments = normalizedRoot.split("/").filter(Boolean);
  const rootSuffix = `/${rootSegments.join("/")}/`;

  // Absolute POSIX paths, and Windows paths whose drive letter differs from the
  // host, can both be handled by matching the repository's normalized suffix.
  if (input === normalizedRoot) return "";
  if (input.startsWith(`${normalizedRoot}/`)) {
    return posix.normalize(input.slice(normalizedRoot.length + 1));
  }
  const suffixIndex = input.lastIndexOf(rootSuffix);
  if (suffixIndex >= 0) {
    return posix.normalize(input.slice(suffixIndex + rootSuffix.length));
  }

  // Relative paths are resolved against the repository, not process.cwd().
  // Strip a repository-directory prefix when a runner emits `9router/tests/...`.
  let relativePath = input.replace(/^\.\//, "");
  const repoName = rootSegments.at(-1);
  if (relativePath === repoName) return "";
  if (relativePath.startsWith(`${repoName}/`)) relativePath = relativePath.slice(repoName.length + 1);
  if (win32.isAbsolute(input) || input.startsWith("/")) {
    return posix.normalize(relative(root, resolve(root, relativePath)).replaceAll("\\", "/"));
  }
  return posix.normalize(relativePath);
}

export function readKnownFails(path = `${baselineDir}/known-fails.txt`) {
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
  );
}

export function failuresFromResults(results) {
  return results.testResults.flatMap(file => {
    const filePath = normalizeTestPath(file.name);
    const assertions = file.assertionResults ?? [];
    const failures = assertions
      .filter(assertion => assertion.status === "failed")
      .map(assertion => `${filePath} :: ${assertion.fullName}`);
    if (failures.length === 0 && assertions.length === 0 && file.status === "failed") {
      failures.push(`${filePath} :: <suite failed to load>`);
    }
    return failures;
  });
}

export function classifyFailures(results, knownFails = readKnownFails()) {
  const nowFails = failuresFromResults(results);
  const known = nowFails.filter(failure => knownFails.has(failure));
  const regressions = nowFails.filter(failure => !knownFails.has(failure));
  return { nowFails, known, regressions, knownFails };
}

function main() {
  const resultsPath = process.argv[2];
  if (!resultsPath) {
    console.error("Missing results.json path");
    process.exitCode = 2;
    return;
  }

  const results = JSON.parse(readFileSync(resultsPath, "utf8"));
  const { nowFails, known, regressions, knownFails } = classifyFailures(results);

  if (regressions.length) {
    console.error(`\n❌ REGRESSION: ${regressions.length} test pass→fail:\n`);
    regressions.forEach(failure => console.error(`  - ${failure}`));
    console.error(`\nKnown failures: ${known.length}; current failures: ${nowFails.length}; baseline entries: ${knownFails.size}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ No regression. (current failures=${nowFails.length}, known failures=${known.length}, baseline entries=${knownFails.size})`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
