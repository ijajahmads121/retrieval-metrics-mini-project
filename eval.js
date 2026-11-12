// Evaluate the provided keyword and semantic search rankings with MRR and Recall@10.
// Run with: node eval.js
const fs = require('fs');

const K = 10;

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error(`Unclosed quoted field in CSV row: ${line}`);
  fields.push(field);
  return fields;
}

function loadTestSet(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`${path} must contain a header and at least one query`);

  return lines.slice(1).map((line, index) => {
    const [query, ids] = parseCsvLine(line);
    if (!query || !ids) throw new Error(`Invalid test-set row ${index + 2}: ${line}`);
    const correctIds = ids.split(';').map(value => Number(value.trim()));
    if (correctIds.some(id => !Number.isFinite(id))) {
      throw new Error(`Invalid correct post ID in test-set row ${index + 2}: ${ids}`);
    }
    return { query, correctIds };
  });
}

const testSet = loadTestSet('test-set.csv');
const results = JSON.parse(fs.readFileSync('search-results.json', 'utf8'));

// Return the 1-based rank of the first relevant result in the top K, or null.
function rankOf(rankedIds, correctIds) {
  const correctIdSet = new Set(correctIds.map(Number));
  const index = rankedIds.slice(0, K).findIndex(id => correctIdSet.has(Number(id)));
  return index === -1 ? null : index + 1;
}

// Reciprocal rank is 1/rank for the first relevant result, or 0 for a miss.
function reciprocalRank(rankedIds, correctIds) {
  const rank = rankOf(rankedIds, correctIds);
  return rank === null ? 0 : 1 / rank;
}

const keywordRRs = [];
const semanticRRs = [];
let keywordHits = 0;
let semanticHits = 0;
const rows = [];

for (const { query, correctIds } of testSet) {
  const queryResults = results[query];
  if (!queryResults || !Array.isArray(queryResults.keyword) || !Array.isArray(queryResults.semantic)) {
    throw new Error(`Missing keyword or semantic ranked results for query: ${query}`);
  }

  const keywordRank = rankOf(queryResults.keyword, correctIds);
  const semanticRank = rankOf(queryResults.semantic, correctIds);
  const keywordRR = reciprocalRank(queryResults.keyword, correctIds);
  const semanticRR = reciprocalRank(queryResults.semantic, correctIds);

  keywordRRs.push(keywordRR);
  semanticRRs.push(semanticRR);
  if (keywordRR > 0) keywordHits += 1;
  if (semanticRR > 0) semanticHits += 1;

  rows.push({ query, keywordRank, semanticRank });
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const keywordMRR = mean(keywordRRs);
const semanticMRR = mean(semanticRRs);
const keywordRecall = keywordHits / testSet.length;
const semanticRecall = semanticHits / testSet.length;
const displayRank = rank => rank === null ? 'miss' : String(rank);

console.log('| Query | Keyword rank | Semantic rank |');
console.log('|---|---|---|');
for (const { query, keywordRank, semanticRank } of rows) {
  console.log(`| ${query} | ${displayRank(keywordRank)} | ${displayRank(semanticRank)} |`);
}
console.log(`| **Summary** | **MRR ${keywordMRR.toFixed(2)} · Recall@10 ${keywordRecall.toFixed(2)}** | **MRR ${semanticMRR.toFixed(2)} · Recall@10 ${semanticRecall.toFixed(2)}** |`);
