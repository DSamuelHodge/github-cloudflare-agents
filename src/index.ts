import { GitHubIssueWorkflow, type Env, type GitHubIssuePayload } from './worflow';

export type { Env, GitHubIssuePayload };
export { GitHubIssueWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const eventType = request.headers.get('x-github-event');
    const contentType = request.headers.get('content-type') || '';

    // Health check endpoint
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Only accept POST requests for webhooks
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Verify GitHub webhook signature on raw body
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return new Response('Missing signature', { status: 401 });
    }

    // GitHub can send JSON or form-encoded; read raw body for signature
    const rawBody = await request.text();
    const isValid = await verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }

    // Parse the webhook payload
    const payloadText = extractPayload(rawBody, contentType);
    let payload: GitHubIssuePayload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Handle ping event gracefully
    if (eventType === 'ping') {
      return Response.json({ ok: true, ping: 'pong' });
    }

    // Ignore non-issue events
    if (eventType !== 'issues') {
      return Response.json({ ok: true, ignored: eventType ?? 'unknown' }, { status: 200 });
    }

    // Trigger the workflow directly (bypass Workflows binding)
    try {
      const workflow = new GitHubIssueWorkflow();
      const result = await workflow.run(
        { payload },
        {} as unknown,
        env
      );

      return new Response(JSON.stringify({ status: 'workflow completed', result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

function extractPayload(body: string, contentType: string | null): string {
  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const payload = params.get('payload');
    if (payload) return payload;
  }
  return body;
}

async function verifyGitHubSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expected = `sha256=${Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`;

  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}