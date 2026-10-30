import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

const MAX_BODY = 64 * 1024;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export type ReviewServer = {
  url: string;
  token: string;
  done: Promise<void>;
  close(): Promise<void>;
};

export type ReviewInput = {
  renderPage(token: string): string;
  onApply(rules: string[], keep: string[], target: string): Promise<string>;
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > MAX_BODY) {
        reject(new Error('request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function parseForm(body: string): { rules: string[]; keep: string[]; target: string } {
  const params = new URLSearchParams(body);
  return {
    rules: params.getAll('rule'),
    keep: params.getAll('keep'),
    target: params.get('target') ?? '',
  };
}

/**
 * A loopback-only server for the review page. It binds 127.0.0.1 on an ephemeral port, requires a
 * single-use token in the path, accepts one POST and then closes. Nothing leaves the machine and
 * no request without the token is answered.
 */
export async function startReview(input: ReviewInput): Promise<ReviewServer> {
  const token = randomBytes(16).toString('hex');

  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const server: Server = createServer((request, response) => {
    void handle(request, response, token, input, () => {
      finish();
      setTimeout(() => server.close(), 200);
    });
  });
  server.on('close', () => finish());

  const idle = setTimeout(() => server.close(), IDLE_TIMEOUT_MS);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('could not bind the review server');
  }

  return {
    url: `http://127.0.0.1:${address.port}/${token}`,
    token,
    done,
    close: () =>
      new Promise<void>((resolve) => {
        clearTimeout(idle);
        server.close(() => resolve());
      }),
  };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  input: ReviewInput,
  scheduleClose: () => void,
): Promise<void> {
  const url = request.url ?? '/';
  const path = url.split('?')[0] ?? '/';

  if (request.method === 'GET' && path === `/${token}`) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(input.renderPage(token));
    return;
  }

  if (request.method === 'POST' && path === `/${token}/apply`) {
    let body: string;
    try {
      body = await readBody(request);
    } catch {
      response.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('request too large\n');
      return;
    }

    const { rules, keep, target } = parseForm(body);
    if (target.trim() === '') {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('a target file is required\n');
      return;
    }

    const page = await input.onApply(rules, keep, target);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
    scheduleClose();
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found\n');
}
