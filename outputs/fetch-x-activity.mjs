import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const envPath = new URL(".env", import.meta.url);
const outputPath = new URL("x-activity-data.json", import.meta.url);
const scriptOutputPath = new URL("x-activity-data.js", import.meta.url);
const htmlPath = new URL("x-activity-contributions.html", import.meta.url);
const standaloneHtmlPath = new URL("x-activity-contributions-with-data.html", import.meta.url);

function loadDotEnv(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

if (existsSync(envPath)) {
  loadDotEnv(await readFile(envPath, "utf8"));
}

const bearerToken = process.env.X_BEARER_TOKEN;
const username = process.env.X_USERNAME || "hadleycallaway";
const maxPages = Number(process.env.X_MAX_PAGES || 8);

if (!bearerToken || bearerToken.includes("replace-with")) {
  console.error("Missing X_BEARER_TOKEN. Copy outputs/.env.example to outputs/.env and add your bearer token.");
  process.exit(1);
}

async function xGet(path, params = {}) {
  const url = new URL(`https://api.x.com/2${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "User-Agent": "x-activity-contributions/1.0"
    }
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const detail = json?.title || json?.detail || JSON.stringify(json);
    throw new Error(`X API ${response.status}: ${detail}`);
  }
  return json;
}

function emptyDay(date) {
  return {
    date,
    posts: 0,
    replies: 0,
    reposts: 0,
    likes: 0,
    bookmarks: 0,
    impressions: 0,
    externalReplies: 0,
    follows: 0
  };
}

function classifyTweet(tweet) {
  const types = new Set((tweet.referenced_tweets || []).map(ref => ref.type));
  if (types.has("retweeted")) return "reposts";
  if (types.has("replied_to")) return "replies";
  return "posts";
}

function addTweet(day, tweet) {
  const bucket = classifyTweet(tweet);
  day[bucket] += 1;
  const metrics = tweet.public_metrics || {};
  day.likes += Number(metrics.like_count || 0);
  day.externalReplies += Number(metrics.reply_count || 0);
  day.impressions += Number(metrics.impression_count || 0);
}

const user = await xGet(`/users/by/username/${encodeURIComponent(username)}`, {
  "user.fields": "created_at,description,location,public_metrics,verified"
});

const userId = user.data?.id;
if (!userId) {
  throw new Error(`Could not find X user @${username}`);
}

const days = new Map();
let paginationToken = undefined;
let pages = 0;
let fetchedTweets = 0;

do {
  const timeline = await xGet(`/users/${userId}/tweets`, {
    max_results: "100",
    pagination_token: paginationToken,
    exclude: "",
    "tweet.fields": "created_at,public_metrics,referenced_tweets,conversation_id,text"
  });
  for (const tweet of timeline.data || []) {
    if (!tweet.created_at) continue;
    const date = tweet.created_at.slice(0, 10);
    const day = days.get(date) || emptyDay(date);
    addTweet(day, tweet);
    days.set(date, day);
    fetchedTweets += 1;
  }
  paginationToken = timeline.meta?.next_token;
  pages += 1;
} while (paginationToken && pages < maxPages);

const payload = {
  generatedAt: new Date().toISOString(),
  source: "x-api-v2-user-tweets",
  profile: {
    id: user.data.id,
    username: user.data.username,
    name: user.data.name,
    description: user.data.description,
    location: user.data.location,
    verified: user.data.verified,
    publicMetrics: user.data.public_metrics
  },
  fetch: {
    pages,
    fetchedTweets,
    truncated: Boolean(paginationToken)
  },
  days: Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date))
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(
  scriptOutputPath,
  `window.X_ACTIVITY_DATA = ${JSON.stringify(payload, null, 2)};\n`,
  "utf8"
);
if (existsSync(htmlPath)) {
  const html = await readFile(htmlPath, "utf8");
  const injectedHtml = html.replace(
    '<script src="x-activity-data.js"></script>',
    `<script>window.X_ACTIVITY_DATA = ${JSON.stringify(payload)};</script>`
  );
  await writeFile(standaloneHtmlPath, injectedHtml, "utf8");
}
console.log(`Wrote ${payload.days.length} active days from ${fetchedTweets} tweets to ${outputPath.pathname}`);
console.log(`Wrote browser companion data to ${scriptOutputPath.pathname}`);
if (existsSync(standaloneHtmlPath)) {
  console.log(`Wrote standalone page to ${standaloneHtmlPath.pathname}`);
}
if (payload.fetch.truncated) {
  console.log(`Stopped after X_MAX_PAGES=${maxPages}. Increase X_MAX_PAGES in .env for a deeper backfill.`);
}
