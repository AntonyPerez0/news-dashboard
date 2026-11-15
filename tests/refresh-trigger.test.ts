import { describe, expect, it, vi } from 'vitest';
import worker, { startDeploy } from '../cloudflare/refresh-trigger/src/index.js';

const env = { GITHUB_TOKEN: 'github_pat_test', GITHUB_REPO: 'someone/news-dashboard' };
const answer = (status: number, body = '') => vi.fn(async () => new Response(status === 204 ? null : body, { status }));

describe('refresh trigger', () => {
  it('starts the deploy workflow on the default branch', async () => {
    const fetchImpl = answer(204);
    await startDeploy(env, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/someone/news-dashboard/actions/workflows/deploy.yml/dispatches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'main' });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer github_pat_test');
    expect(headers['User-Agent']).toBeTruthy(); // GitHub refuses requests without one
  });

  it('follows the configured workflow and branch', async () => {
    const fetchImpl = answer(204);
    await startDeploy({ ...env, GITHUB_WORKFLOW: 'publish.yml', GITHUB_REF: 'release' }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/workflows/publish.yml/dispatches');
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'release' });
  });

  it('fails loudly with GitHub\'s reason when the token stops working', async () => {
    await expect(startDeploy(env, answer(401, '{"message":"Bad credentials"}'))).rejects.toThrow(
      /GitHub answered 401.*Bad credentials/
    );
    await expect(startDeploy(env, answer(422, '{"message":"Workflow is disabled"}'))).rejects.toThrow(/422/);
  });

  it('does not call GitHub without a token or a repository', async () => {
    const fetchImpl = answer(204);
    await expect(startDeploy({ GITHUB_REPO: env.GITHUB_REPO }, fetchImpl)).rejects.toThrow(/GITHUB_TOKEN/);
    await expect(startDeploy({ GITHUB_TOKEN: env.GITHUB_TOKEN }, fetchImpl)).rejects.toThrow(/GITHUB_REPO/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs from the cron handler', async () => {
    const fetchImpl = answer(204);
    vi.stubGlobal('fetch', fetchImpl);
    await worker.scheduled({}, env);
    vi.unstubAllGlobals();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
