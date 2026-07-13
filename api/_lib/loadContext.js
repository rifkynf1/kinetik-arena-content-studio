const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const ROOT = path.join(__dirname, "..", "..");

function readTextFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function readCSV(relativePath) {
  const raw = readTextFile(relativePath);
  const { data, errors } = Papa.parse(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length) {
    console.warn(`Peringatan parsing CSV (${relativePath}):`, errors[0].message);
  }
  return data;
}

function loadRules() {
  return readTextFile("rules.md");
}

function loadSamplePosts() {
  return readCSV("data/sample_posts.csv");
}

function loadComments(filename = "comments_dataset.csv") {
  return readCSV(`data/${filename}`);
}

module.exports = { loadRules, loadSamplePosts, loadComments };
