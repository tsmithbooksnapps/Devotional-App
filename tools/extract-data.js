// Pulls the content data out of preview/altar-template.html into tools/data.js,
// so tools/seedgen.js can turn it into supabase/seed.sql:
//   node tools/extract-data.js && node tools/seedgen.js > supabase/seed.sql
const fs = require("fs");
const path = require("path");
const s = fs.readFileSync(path.join(__dirname, "../preview/altar-template.html"), "utf8");
const part = (from, to) => s.slice(s.indexOf(from), s.indexOf(to));
fs.writeFileSync(path.join(__dirname, "data.js"),
  part("const ACCESS", "/* Upkeep that the app adds") + part("const SPACE_UPKEEP", "const MONTHS") +
  "\nmodule.exports = { NEEDS, SPACES, DURATIONS, PANTHEONS, SPACE_UPKEEP };\n");
