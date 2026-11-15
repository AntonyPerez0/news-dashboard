// Cloudflare Worker that keeps the hosted site fresh: on a timer (see
// wrangler.toml) it starts the repository's deploy workflow, which rebuilds
// the news snapshots and republishes the site.
//
// GitHub's own `schedule:` trigger is best-effort and ran this workflow only
// every few hours; a Worker cron fires when it says it will.
//
// Needs one secret, GITHUB_TOKEN: a fine-grained personal access token for
// this repository with the "Actions: read and write" permission, nothing else.

export async function startDeploy(env, fetchImpl = fetch) {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_WORKFLOW = 'deploy.yml', GITHUB_REF = 'main' } = env;
  if (!GITHUB_TOKEN) throw new Error('The GITHUB_TOKEN secret is not set on this Worker');
  if (!GITHUB_REPO) throw new Error('GITHUB_REPO is not set (expected "owner/repository")');

  const res = await fetchImpl(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'newsdash-refresh-trigger' // GitHub rejects requests without one
      },
      body: JSON.stringify({ ref: GITHUB_REF })
    }
  );
  // Thrown errors show up under the Worker's cron events, with GitHub's
  // reason: 401 = token expired or revoked, 403/404 = token lacks access to
  // the repository, 422 = workflow disabled or the ref does not exist.
  if (!res.ok) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export default {
  async scheduled(_controller, env) {
    await startDeploy(env);
  }
};
