import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const disciplineSource = read("lib/discipline.ts");
const appShellSource = read("components/AppShell.tsx");
const evaluationsPageSource = read("app/evaluations/page.tsx");

function read(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);

  return source.slice(startIndex, endIndex);
}

const footballDefinition = between(
  disciplineSource,
  "football_11: {",
  "  futsal: {"
);
const futsalDefinition = between(
  disciplineSource,
  "  futsal: {",
  "\n};"
);
const footballTraining = between(
  footballDefinition,
  "trainingModules: [",
  "evaluationModules: ["
);
const footballEvaluations = footballDefinition.slice(
  footballDefinition.indexOf("evaluationModules: [")
);
const futsalTraining = between(
  futsalDefinition,
  "trainingModules: [",
  "evaluationModules: ["
);
const futsalEvaluations = futsalDefinition.slice(
  futsalDefinition.indexOf("evaluationModules: [")
);
const trainingActiveNavigation = between(
  appShellSource,
  "const trainingActivePaths",
  "const evaluationsActivePaths"
);
const evaluationActiveNavigation = between(
  appShellSource,
  "const evaluationsActivePaths",
  "const matchesActivePaths"
);

test("Evaluations excludes video analysis and retains formal exams", () => {
  assert.doesNotMatch(footballEvaluations, /Videoanalisis|\/training\/video-analysis/);
  assert.match(footballEvaluations, /title: "Examen arbitral"/);
  assert.match(footballEvaluations, /href: "\/training\/exam"/);

  assert.doesNotMatch(futsalEvaluations, /Videoanalisis de futsal|\/futsal\/video-analysis/);
  assert.match(futsalEvaluations, /title: "Examen de reglas FIFA Futsal"/);
  assert.match(futsalEvaluations, /href: "\/futsal\/rules-exam"/);
  assert.doesNotMatch(evaluationsPageSource, /evaluations\s*\[\s*0\s*\]/);
});

test("Training retains video analysis navigation for both disciplines", () => {
  assert.match(footballTraining, /title: "Videoanalisis"/);
  assert.match(footballTraining, /href: "\/training\/video-analysis"/);
  assert.match(futsalTraining, /title: "Videoanalisis de futsal"/);
  assert.match(futsalTraining, /href: "\/futsal\/video-analysis"/);

  assert.equal(
    existsSync(resolve(repositoryRoot, "app/training/video-analysis/page.tsx")),
    true
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, "app/futsal/video-analysis/page.tsx")),
    true
  );
});

test("Video analysis routes activate Training rather than Evaluations", () => {
  assert.match(trainingActiveNavigation, /"\/training\/video-analysis"/);
  assert.match(trainingActiveNavigation, /"\/futsal\/video-analysis"/);
  assert.doesNotMatch(evaluationActiveNavigation, /"\/training\/video-analysis"/);
  assert.doesNotMatch(evaluationActiveNavigation, /"\/futsal\/video-analysis"/);
});
