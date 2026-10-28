import { useEffect, useState } from 'react';

type UseCachingFetch = (url: string) => {
  isLoading: boolean;
  data: unknown;
  error: Error | null;
};

// Errors are kept as strings because Error objects don't survive
// JSON.stringify, and this cache gets sent to the browser as JSON.
type CacheEntry = {
  data: unknown;
  error: string | null;
};

const cache = new Map<string, CacheEntry>();

// Requests that are still running. Components that mount mid-request join
// these instead of starting another fetch.
const inFlight = new Map<string, Promise<void>>();

// Never throws. A failed request is cached as an error, so the server renders
// the app's error state instead of returning a 500.
const load = (url: string): Promise<void> => {
  const existing = inFlight.get(url);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url} responded ${response.status}`);
      }
      cache.set(url, { data: await response.json(), error: null });
    } catch (thrown) {
      cache.set(url, {
        data: null,
        error: thrown instanceof Error ? thrown.message : String(thrown),
      });
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, request);
  return request;
};

// Reads the cache while rendering rather than in an effect. That's what lets
// the server render real data, since effects never run server-side.
export const useCachingFetch: UseCachingFetch = (url) => {
  const [, setRenderCount] = useState(0);
  const entry = cache.get(url);

  useEffect(() => {
    if (cache.has(url)) return;

    let mounted = true;
    load(url).then(() => {
      if (mounted) setRenderCount((count) => count + 1);
    });

    return () => {
      mounted = false;
    };
  }, [url]);

  if (!entry) return { isLoading: true, data: null, error: null };

  return {
    isLoading: false,
    data: entry.data,
    error: entry.error === null ? null : new Error(entry.error),
  };
};

// Fills the cache before the server renders, so the hook has something to read.
export const preloadCachingFetch = async (url: string): Promise<void> => {
  await load(url);
};

// The framework drops this straight into a single-quoted <script> tag, so a
// quote or a </script> in the data would otherwise break the page.
const escapeForInlineScript = (json: string): string =>
  json.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');

export const serializeCache = (): string =>
  escapeForInlineScript(JSON.stringify(Array.from(cache.entries())));

// The escaping above is already undone by the time this runs. The browser does
// it while parsing the script tag.
export const initializeCache = (serializedCache: string): void => {
  try {
    const entries = JSON.parse(serializedCache) as [string, CacheEntry][];
    for (const [url, entry] of entries) {
      cache.set(url, entry);
    }
  } catch {
    // A bad payload shouldn't break the page. Components fetch on the client instead.
  }
};

export const wipeCache = (): void => {
  cache.clear();
  inFlight.clear();
};
