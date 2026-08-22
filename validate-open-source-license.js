const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const license = read("LICENSE");
const readme = read("README.md");
const notice = read("NOTICE.txt");
const additional = read("ADDITIONAL_TERMS.md");
const html = read("index.html");

assert(license.includes("GNU AFFERO GENERAL PUBLIC LICENSE"), "LICENSE must contain GNU AGPL v3");
assert(license.includes("Version 3, 19 November 2007"), "LICENSE must identify AGPL version 3");
assert(readme.includes("AGPL-3.0-only"), "README must identify the SPDX license");
assert(notice.includes("Ez Viewerを基に作成"), "NOTICE must retain the required attribution");
assert(additional.includes("Section 7(b)"), "Additional terms must identify the AGPL basis");
assert(additional.includes("製品名を「Ez Viewer」に固定する条件ではありません"), "Additional terms must not force the derivative product name");
assert(html.includes('data-help-section="license"'), "Help must expose legal notices");
assert(html.includes("ソースコードを開く"), "The web app must provide a source-code link");
assert(html.includes("無保証で提供されます"), "The web app must display the no-warranty notice");

for (const [name, content] of [["README.md", readme], ["NOTICE.txt", notice]]) {
  assert(!content.includes("無断複製、改変、転載、再配布および販売を禁止"), `${name} still contradicts the open-source license`);
  assert(!content.includes("All Rights Reserved"), `${name} still contains the previous closed-source notice`);
}

console.log("open-source license checks passed");
