# X Contribution Heatmap

A static GitHub-style contribution graph for [@hadleycallaway](https://x.com/hadleycallaway) on X.

The page combines posts, replies, reposts, bookmarks, and public engagement metrics into one contribution score, then renders it as a contribution heatmap inspired by GitHub's profile graph.

Live site: <https://hccallaway.github.io/x-contribution-heatmap/>

## What It Shows

- A unified daily contribution heatmap
- Profile-level X account metadata
- Total contribution points, active days, action points, and engagement points
- An activity mix for posts, replies, reposts, likes, and bookmarks

## Data Model

Daily score is based on:

```text
post * 6 + reply * 3 + repost * 2 + bookmark * 2 + engagement
```

Engagement currently includes public metrics returned by the X API, such as likes, impressions, replies received, and follows. Some private actions, such as bookmarks, require imported data because X does not expose every private interaction through public profile pages.

## Project Structure

```text
.
|-- index.html
`-- outputs/
    |-- fetch-x-activity.mjs
    |-- x-activity-contributions.html
    |-- x-activity-contributions-with-data.html
    |-- x-activity-data.js
    `-- x-activity-data.json
```

`x-activity-contributions.html` is the source page. `x-activity-contributions-with-data.html` is the standalone GitHub Pages page with the latest generated data embedded.

## Refreshing Data Locally

Create a local env file:

```sh
cd outputs
cp .env.example .env
```

Then add an X API bearer token to `outputs/.env`:

```text
X_BEARER_TOKEN=...
```

Run the refresh:

```sh
node outputs/fetch-x-activity.mjs
```

The refresh writes:

- `outputs/x-activity-data.json`
- `outputs/x-activity-data.js`
- `outputs/x-activity-contributions-with-data.html`

GitHub Pages only serves committed static files, so local refreshes are not visible on the live site until the generated files are committed and pushed.

## Privacy

Secrets are not committed. `outputs/.env` is ignored by git and should stay local.
