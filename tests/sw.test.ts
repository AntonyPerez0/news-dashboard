import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// The service worker is a plain script, so it is run here against stand-ins
// for the worker globals to check how each kind of request is answered.
describe('service worker', () => {
  const ORIGIN = 'https://newsdash.page';

  function loadWorker() {
    const listeners: Record<string, (event: never) => void> = {};
    const stores = new Map<string, Map<string, Response>>();
    const open = async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      const keyOf = (req: Request | string, opts?: { ignoreSearch?: boolean }) => {
        const url = new URL(typeof req === 'string' ? req : req.url, ORIGIN);
        if (opts?.ignoreSearch) url.search = '';
        return url.href;
      };
      return {
        put: async (req: Request, res: Response) => void store.set(keyOf(req), res),
        match: async (req: Request, opts?: { ignoreSearch?: boolean }) => store.get(keyOf(req, opts))?.clone(),
        addAll: async () => {}
      };
    };
    const caches = {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (req: Request, opts: { cacheName: string }) => (await open(opts.cacheName)).match(req)
    };
    const network = vi.fn<(req: Request) => Promise<Response>>();
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: (event: never) => void) => void (listeners[type] = fn),
      skipWaiting: () => {},
      clients: { claim: () => {} }
    };
    new Function('self', 'caches', 'fetch', fs.readFileSync('public/sw.js', 'utf8'))(self, caches, network);

    /** Dispatches a fetch event; resolves to the worker's answer, or null
     *  when it left the request to the browser. */
    const request = (path: string, mode = 'cors') => {
      let answer: Promise<Response> | null = null;
      const req = { url: new URL(path, ORIGIN).href, method: 'GET', mode } as Request;
      listeners.fetch!({ request: req, respondWith: (res: Promise<Response>) => void (answer = res) } as never);
      return answer as Promise<Response> | null;
    };
    return { network, request };
  }

  const page = (text: string) => new Response(text, { status: 200 });

  it('serves the page from the network, so a deploy shows on the next reload', async () => {
    const { network, request } = loadWorker();
    network.mockResolvedValueOnce(page('build 1'));
    expect(await (await request('/', 'navigate'))!.text()).toBe('build 1');
    network.mockResolvedValueOnce(page('build 2'));
    expect(await (await request('/', 'navigate'))!.text()).toBe('build 2');
  });

  it('falls back to the cached page offline, whatever the query string', async () => {
    const { network, request } = loadWorker();
    network.mockResolvedValueOnce(page('cached page'));
    await request('/', 'navigate');
    network.mockRejectedValue(new TypeError('offline'));
    expect(await (await request('/?category=sports&rotate=5', 'navigate'))!.text()).toBe('cached page');
  });

  it('serves hashed assets cache-first', async () => {
    const { network, request } = loadWorker();
    network.mockResolvedValueOnce(page('js'));
    await request('/assets/index-abc123.js');
    expect(await (await request('/assets/index-abc123.js'))!.text()).toBe('js');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('leaves version.json and other origins to the browser', () => {
    const { request } = loadWorker();
    expect(request('/version.json')).toBeNull();
    expect(request('https://cdn.example.com/photo.jpg')).toBeNull();
  });
});
