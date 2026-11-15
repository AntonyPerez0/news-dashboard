// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, isNewerBuild } from '../src/update';
import { BUILD_ID, BUILD_TIME } from '../src/version';

describe('isNewerBuild', () => {
  const current = { build: 'aaa111', time: 1_000 };

  it('is true for a different build committed later', () => {
    expect(isNewerBuild({ build: 'bbb222', time: 2_000 }, current)).toBe(true);
  });

  it('is false for the running build', () => {
    expect(isNewerBuild({ build: 'aaa111', time: 1_000 }, current)).toBe(false);
  });

  it('is false for an older build still served by a lagging cache', () => {
    expect(isNewerBuild({ build: '999000', time: 500 }, current)).toBe(false);
  });

  it('is false for anything that is not build info', () => {
    for (const junk of [null, undefined, 'x', {}, { build: 'bbb222' }, { build: 7, time: 2_000 }]) {
      expect(isNewerBuild(junk, current)).toBe(false);
    }
  });
});

describe('checkForUpdate', () => {
  const serve = (body: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })));
  const newer = { build: `${BUILD_ID}-next`, time: BUILD_TIME + 60_000 };

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('reloads once when a newer build is published', async () => {
    serve(newer);
    const reload = vi.fn();
    await checkForUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(1);

    // Still the old bundle after the reload (a cache in between): no loop.
    await checkForUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the running build is the published one', async () => {
    serve({ build: BUILD_ID, time: BUILD_TIME });
    const reload = vi.fn();
    await checkForUpdate(reload);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing when version.json is missing or the network is down', async () => {
    const reload = vi.fn();
    serve(null, false);
    await checkForUpdate(reload);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await checkForUpdate(reload);
    expect(reload).not.toHaveBeenCalled();
  });

  it('waits while the settings are open, then reloads on a later check', async () => {
    serve(newer);
    const reload = vi.fn();
    document.body.innerHTML = '<aside class="drawer open"></aside>';
    await checkForUpdate(reload);
    expect(reload).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    await checkForUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
