import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);

const requiredEnglishDocs = [
  "docs/README.md",
  "docs/agent-guide.md",
  "docs/api.md",
  "docs/integrating-other-projects.md",
  "docs/sdk.md"
];

const requiredLocalizedDocs = ["README.md", "agent-guide.md", "api.md", "integrating-other-projects.md", "sdk.md"];

const locales = ["zh-CN", "ja"];

async function exists(path) {
  await access(new URL(path, root));
}

for (const doc of requiredEnglishDocs) {
  await exists(doc);
}

for (const locale of locales) {
  for (const doc of requiredLocalizedDocs) {
    await exists(`docs/${locale}/${doc}`);
  }
}

const readme = await readFile(new URL("README.md", root), "utf8");
for (const locale of locales) {
  if (!readme.includes(`docs/${locale}/README.md`)) {
    throw new Error(`README.md must link to docs/${locale}/README.md`);
  }
}

const docsIndex = await readFile(new URL("docs/README.md", root), "utf8");
for (const locale of locales) {
  if (!docsIndex.includes(`${locale}/README.md`)) {
    throw new Error(`docs/README.md must link to ${locale}/README.md`);
  }
}

const localizedIndexes = await Promise.all(
  locales.map(async (locale) => [locale, await readFile(join(rootPath, "docs", locale, "README.md"), "utf8")])
);

for (const [locale, content] of localizedIndexes) {
  for (const doc of requiredLocalizedDocs.filter((name) => name !== "README.md")) {
    if (!content.includes(`](${doc})`)) {
      throw new Error(`docs/${locale}/README.md must link to ${doc}`);
    }
  }
}

console.log("docs locale check: ok");
