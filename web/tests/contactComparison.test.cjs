const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");

// Load the pure TypeScript comparison helper without a browser or a Next server.
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(outputText, filename);
};
const { buildRows } = require("../lib/contactComparison.ts");

function report() {
  return {
    entities: { firms: ["T. Rowe Price"] },
    site_visit: {
      claimed_firm: "T. Rowe Price", claimed_crd: null,
      phones: ["+18775617670", "+14103452000"],
      emails: ["advisorservices@troweprice.com"],
      final_url: "https://www.troweprice.com/en/us",
    },
    official_contact: {
      firm: "T. ROWE PRICE INVESTMENT SERVICES, INC.", crd: "8348",
      phone: "+14103452000", website: null,
    },
    signals: [{ id: "firm_record", check: "pass" }],
  };
}

test("a matched legal subsidiary is a found record, not a brand-name mismatch", () => {
  assert.equal(buildRows(report()).find(row => row.key === "firm").verdict, "record");
});

test("a phone matches when any crawled number matches the official contact", () => {
  assert.equal(buildRows(report()).find(row => row.key === "phone").verdict, "match");
});

test("unlisted official websites do not imply that crawled domains match", () => {
  const rows = buildRows(report());
  assert.equal(rows.find(row => row.key === "email").verdict, "unlisted");
  assert.equal(rows.find(row => row.key === "site").verdict, "unlisted");
});

test("an unknown backend verdict is not replaced by a client-side mismatch", () => {
  const data = report();
  data.site_visit.phones = ["+18005550199"];
  data.signals.push({ id: "phone_match", check: "unknown" });
  assert.equal(buildRows(data).find(row => row.key === "phone").verdict, "unlisted");
});

test("identical firm names can match and missing CRDs remain unlisted", () => {
  const data = report();
  data.site_visit.claimed_firm = data.official_contact.firm.toLowerCase();
  const rows = buildRows(data);
  assert.equal(rows.find(row => row.key === "firm").verdict, "match");
  assert.equal(rows.find(row => row.key === "crd").verdict, "unlisted");
});
