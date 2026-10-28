# People Directory

Server-rendered React app, and the caching fetch library behind it.

Inherited mid-build: the framework and the app were done, the caching library was
stubs. Original brief in `DevTask.md`.

## Getting started

```bash
npm i
npm start
```

<http://localhost:3000>. Two routes show the two ways data can load:

| Route                | Data loads                      | HTML contains |
| -------------------- | ------------------------------- | ------------- |
| `/appWithoutSSRData` | in the browser, after hydration | `Loading...`  |
| `/appWithSSRData`    | on the server, before render    | all 75 people |

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
framework/mock-server  MSW request handlers, shared by Node and the browser.
application            The React app: App -> Person -> Name.
caching-fetch-library  The part that was missing.
```

All three components call `useCachingFetch` with the same URL. `App` renders 75
`Person`s, each rendering a `Name`, so a loaded page makes **151 calls to one
endpoint**. The library turns those into one network request, then hands the
result to the browser so the SSR route doesn't fetch again.

Requests are answered by MSW rather than the real network, so this runs offline.

## What I added

| Change                        | Why                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`                  | Nothing existed, so `node_modules/`, `dist/`, `.DS_Store` and `.idea/` could all be committed by accident.                                                                 |
| Committed `package-lock.json` | Without one, `npm i` grabs the newest allowed version of every package, so two people can get different code from the same `package.json`.                                 |
| `typescript`                  | There was a `tsconfig.json` but no compiler, so the type-check Task 2 asks for couldn't be run at all.                                                                     |
| `tsconfig.json` rewrite       | Was 200 lines of commented-out defaults. Cut to what's actually set, plus `noEmit`: esbuild does the real compiling, so tsc is only here to check types.                   |
| `npm run typecheck`           | Turns "it type-checks" from a claim into a command.                                                                                                                        |
| `prettier` + config           | `.idea/prettier.xml` showed it was meant to be used but never set up. I matched the style already in the files, so nothing got reformatted and `git blame` stays readable. |
| `.nvmrc`                      | Pins Node 22.                                                                                                                                                              |
| GitHub Actions CI             | Runs typecheck, format check, and build on every push and pull request.                                                                                                    |
| MSW worker path               | See below.                                                                                                                                                                 |

## Deferred

| Item                            | Why not                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests (Vitest, one dedupe test) | Biggest gap. "Only 1 network request" is the one criterion you can't verify by reading the code. Vitest because the repo already builds with esbuild and Vitest runs on it; Jest would need a second compiler. |
| ESLint                          | Most work to set up, least to gain on 200 lines of already-tidy code.                                                                                                                                          |

## Inherited issues

### Fixed: MSW was shipping a stale service worker

`package.json` pointed `msw.workerDirectory` at `mockServer`, but the build copies
the worker out of `framework/mock-server`. The folder was renamed at some point
without updating the config, so every `npm install` refreshed a folder nothing
read, while the file the build actually ships sat untouched. The browser was
running a 2.3.1 worker against a 2.15.0 library. Repointed the config, refreshed
the file.

### Known issues, not fixed

**`window.__INITIAL_DATA__` isn't escaped.** `buildHtmlDoc.ts:14` drops the cache
straight into a single-quoted `<script>`. One apostrophe in the API data breaks
the page, and a `</script>` in it is an XSS hole. The current mock data happens to
contain no apostrophes, so this works by luck. I escape on the way out of
`serializeCache`, but the real fix belongs in the framework: put the data in a
`<script type="application/json">` tag and parse it, instead of building
JavaScript by string concatenation.

**Per-request cache isolation can't work.** The cache outlives each request, so
without clearing it request #2 would see request #1's data. The framework does
that by calling `wipeCache()` at the start of every request
(`framework/server/index.ts:44,52`). But one shared cache can't isolate anything:
two overlapping requests use the same one, and either can wipe it while the other
is still reading. Fine for one person clicking around, wrong under real traffic. A
request-scoped cache would fix it, but that means changing the library's public
API.

**`validateData` runs in every component on every render.** All 151 components
re-validate all 75 records (`App.tsx:24`, `Person.tsx:19`, `Name.tsx:18`). It
should run once, where data enters the cache.

`npm audit` also flags 4 known security bugs in `fastify` and `valibot`. Fixing
any of them means a major version jump that could break the app, so I left them
alone.

## Notes on the caching library

<!-- TODO (Phase 4) -->
