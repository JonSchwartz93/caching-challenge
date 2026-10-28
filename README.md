# People Directory

Server-rendered React app (and the accompanying caching fetch library).

For more context on the task, see `DevTask.md`.

## Getting started

```bash
npm i
npm start
```

<http://localhost:3000>. Two routes show the two ways data can load:

| Route                | Data loads                         | HTML contains |
| -------------------- | ---------------------------------- | ------------- |
| `/appWithoutSSRData` | client-side, once React takes over | `Loading...`  |
| `/appWithSSRData`    | server-side, before render         | all 75 people |

## Scripts

| Script                 | Does                                    |
| ---------------------- | --------------------------------------- |
| `npm start`            | build, then serve on :3000              |
| `npm run build`        | bundle server and client into `dist/`   |
| `npm run typecheck`    | check types, write nothing              |
| `npm run format`       | run Prettier                            |
| `npm run format:check` | check formatting without changing files |

## How it fits together

```
framework/server       Fastify. Serves the routes, client.js, and the MSW worker.
framework/client       Hydrates the app in the browser.
framework/mock-server  Mock Service Worker handlers, shared by Node and the browser.
application            The React app: App -> Person -> Name.
caching-fetch-library  The part that was missing.
```

All three React components call `useCachingFetch` with the same URL. `App` renders 75
`Person`s, each rendering a `Name`, so a loaded page invokes `useCachingFetch` **151 times**. The caching library turns those into a single network request, then hands the
result to the browser so the SSR route doesn't fetch again.

Requests are answered by Mock Service Worker, not the network, so this runs
offline.

## Production-readiness: _added_

| Change                        | Why                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`                  | Nothing existed, so `node_modules/`, `dist/`, `.DS_Store` and `.idea/` could all be committed by accident.                                                                 |
| Committed `package-lock.json` | Without one, `npm i` grabs the newest allowed version of every package, so two people can get different code from the same `package.json`.                                 |
| `typescript`                  | There was a `tsconfig.json` but no compiler, so the type-check Task 2 asks for couldn't be run at all.                                                                     |
| `tsconfig.json` rewrite       | Was 111 lines, nearly all commented-out defaults. Cut to what's in use, plus `noEmit`, since esbuild does the compiling and tsc only checks types.                         |
| `npm run typecheck`           | Runs `tsc` locally and in CI.                                                                                                                                              |
| `prettier` + config           | `.idea/prettier.xml` showed it was meant to be used but never set up. I matched the style already in the files, so nothing got reformatted and `git blame` stays readable. |
| `.nvmrc`                      | Pins the Node major to 22.                                                                                                                                                 |
| GitHub Actions CI             | Runs typecheck, format check, and build on every push and pull request.                                                                                                    |
| MSW worker path               | `msw.workerDirectory` pointed at a folder the build doesn't read, so installs never refreshed the worker that actually ships.                                              |

## Production-readiness: _deferred_

| Item   | What I'd do                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests  | Vitest would be a good option here, over Jest, since the repo already builds with esbuild and Vitest runs on it. Jest would mean a second compiler. |
| ESLint | Worth adding as the library grows, though 370 lines of already-consistent code gain little from it today.                                           |

## Pre-existing issues

1. **`window.__INITIAL_DATA__` isn't escaped.** `buildHtmlDoc.ts:14` drops the
   cache straight into a single-quoted `<script>`. One apostrophe in the API data
   breaks the page, and a `</script>` in it is an XSS hole. The current mock data
   happens to contain no apostrophes, so this works by luck. I escape on the way
   out of `serializeCache`, but the real fix belongs in the framework: put the
   data in a `<script type="application/json">` tag and parse it, instead of
   building JavaScript by string concatenation.

2. **Per-request cache isolation doesn't hold.** The cache outlives each request,
   so without clearing it request #2 would see request #1's data. The framework
   does that by calling `wipeCache()` at the start of every request
   (`framework/server/index.ts:44,52`). But one shared cache can't isolate
   anything: two overlapping requests use the same one, and either can wipe it
   while the other is still reading. Fine for one person clicking around a demo,
   wrong in production. Scoping the cache per request, with `AsyncLocalStorage`
   or a cache passed in, would fix it, but that means changing the library's
   public API.

3. **`validateData` runs in every component on every render.** All 151 components
   re-validate all 75 records (`App.tsx:24`, `Person.tsx:19`, `Name.tsx:18`). It
   should run once, where data enters the cache.

4. **Dependency advisories.** `npm audit` flags issues in `esbuild`, `fastify`,
   `find-my-way` and `valibot`. Every fix is a breaking change, so I left them.
   The esbuild one only affects its dev server, which this project doesn't use.

## Issues w/ my caching library implementation

1. **Nothing ever expires.** There is no TTL and no revalidation, so once a URL
   is cached the app never sees fresher data. One option could be to use
   "stale-while-revalidate", where you serve the cached value immediately and
   fetch the updated content in the background.

2. **Errors are cached and never retried.** A failed fetch gets stored like a
   successful one, so the component keeps showing the error until something calls
   `wipeCache`.
