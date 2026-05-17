import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComposioAdapter } from './composio-adapter.js';
import { loadLocalEnv } from './env.js';
import {
  type ChatHistoryMessage,
  runDefaultPassportAgentMission,
  runPassportChatMission,
} from './agent.js';
import {
  createAccessGrant,
  getConnections,
  getOrCreateUser,
  saveConnection,
} from './passport-store.js';

loadLocalEnv();

const port = Number(process.env.AGENT_PASSPORT_DEMO_PORT ?? 8787);
const host = process.env.AGENT_PASSPORT_DEMO_HOST ?? '127.0.0.1';
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(rootDir, 'public');
const apiKey = process.env.COMPOSIO_API_KEY;
const composio = apiKey ? new ComposioAdapter(apiKey) : null;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end(body);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return (raw ? JSON.parse(raw) : {}) as T;
}

function getCallbackUrl(request: IncomingMessage): string {
  const host = request.headers.host ?? `localhost:${port}`;
  return `http://${host}/callback`;
}

function normalizeApp(app: string | undefined): string {
  return (app ?? 'gmail').trim().toLowerCase();
}

async function syncConnection(email: string, appInput?: string): Promise<{
  user: ReturnType<typeof getOrCreateUser>;
  connected: boolean;
  connections: ReturnType<typeof getConnections>;
}> {
  const user = getOrCreateUser(email);
  const app = normalizeApp(appInput);

  if (!composio) {
    return {
      user,
      connected: false,
      connections: getConnections(user.id),
    };
  }

  const accounts = await composio.listConnectedAccounts(user.id);
  const activeAccount = accounts.find((account) => account.app === app && account.status === 'active');

  if (activeAccount) {
    saveConnection(user.id, {
      app,
      provider: 'composio',
      connectedAccountId: activeAccount.id,
      label: activeAccount.label,
      status: 'ready',
      scopes: [`${app}.readonly`],
    });
  }

  return {
    user,
    connected: Boolean(activeAccount),
    connections: getConnections(user.id),
  };
}

async function syncPassport(email: string): Promise<{
  user: ReturnType<typeof getOrCreateUser>;
  connections: ReturnType<typeof getConnections>;
}> {
  const user = getOrCreateUser(email);

  if (!composio) {
    return {
      user,
      connections: getConnections(user.id),
    };
  }

  const accounts = await composio.listConnectedAccounts(user.id);

  for (const account of accounts) {
    if (!account.app || account.status !== 'active') {
      continue;
    }

    saveConnection(user.id, {
      app: account.app,
      provider: 'composio',
      connectedAccountId: account.id,
      label: account.label,
      status: 'ready',
      scopes: [`${account.app}.readonly`],
    });
  }

  return {
    user,
    connections: getConnections(user.id),
  };
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (url.pathname === '/api/config' && request.method === 'GET') {
    sendJson(response, 200, {
      composioConfigured: Boolean(composio),
      defaultPort: port,
    });
    return;
  }

  if (url.pathname === '/api/catalog' && request.method === 'GET') {
    if (!composio) {
      sendJson(response, 400, { error: 'COMPOSIO_API_KEY is not configured.' });
      return;
    }

    const apps = await composio.listConnectableApps();
    sendJson(response, 200, { apps });
    return;
  }

  if (
    (url.pathname === '/api/connect-gmail' || url.pathname === '/api/connect') &&
    request.method === 'POST'
  ) {
    if (!composio) {
      sendJson(response, 400, { error: 'COMPOSIO_API_KEY is not configured.' });
      return;
    }

    const body = await readJsonBody<{ email?: string; app?: string }>(request);

    if (!body.email) {
      sendJson(response, 400, { error: 'email is required.' });
      return;
    }

    const app = normalizeApp(body.app);
    const user = getOrCreateUser(body.email);
    const oauthUrl = await composio.createConnectUrl(user.id, app, getCallbackUrl(request));

    sendJson(response, 200, {
      user,
      app,
      oauthUrl,
    });
    return;
  }

  if (url.pathname === '/api/status' && request.method === 'POST') {
    const body = await readJsonBody<{ email?: string; app?: string }>(request);

    if (!body.email) {
      sendJson(response, 400, { error: 'email is required.' });
      return;
    }

    const status = await syncConnection(body.email, body.app);
    sendJson(response, 200, status);
    return;
  }

  if (url.pathname === '/api/passport' && request.method === 'POST') {
    const body = await readJsonBody<{ email?: string }>(request);

    if (!body.email) {
      sendJson(response, 400, { error: 'email is required.' });
      return;
    }

    const passport = await syncPassport(body.email);
    sendJson(response, 200, {
      ...passport,
      profile: {
        id: 'profile_default',
        name: 'Default',
      },
    });
    return;
  }

  if (url.pathname === '/api/run-agent' && request.method === 'POST') {
    if (!composio) {
      sendJson(response, 400, { error: 'COMPOSIO_API_KEY is not configured.' });
      return;
    }

    const body = await readJsonBody<{ email?: string; app?: string }>(request);

    if (!body.email) {
      sendJson(response, 400, { error: 'email is required.' });
      return;
    }

    const passport = await syncPassport(body.email);

    if (passport.connections.length === 0) {
      sendJson(response, 409, { error: 'Default passport has no connected apps yet.', passport });
      return;
    }

    const grant = createAccessGrant(
      passport.user,
      'Run read-only checks across the Default passport.',
    );
    const result = await runDefaultPassportAgentMission(composio, passport.user.id, grant);

    sendJson(response, 200, {
      user: passport.user,
      grant,
      result,
    });
    return;
  }

  if (url.pathname === '/api/chat' && request.method === 'POST') {
    if (!composio) {
      sendJson(response, 400, { error: 'COMPOSIO_API_KEY is not configured.' });
      return;
    }

    const body = await readJsonBody<{
      email?: string;
      message?: string;
      history?: ChatHistoryMessage[];
    }>(request);

    if (!body.email) {
      sendJson(response, 400, { error: 'email is required.' });
      return;
    }

    if (!body.message?.trim()) {
      sendJson(response, 400, { error: 'message is required.' });
      return;
    }

    const passport = await syncPassport(body.email);

    if (passport.connections.length === 0) {
      sendJson(response, 409, { error: 'Default passport has no connected apps yet.', passport });
      return;
    }

    const grant = createAccessGrant(passport.user, body.message.trim());
    const result = await runPassportChatMission(
      composio,
      passport.user.id,
      grant,
      body.message.trim(),
      Array.isArray(body.history) ? body.history : [],
    );

    sendJson(response, 200, {
      user: passport.user,
      grant,
      result,
    });
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
}

function serveStatic(response: ServerResponse, pathname: string): void {
  const filePath = pathname === '/' ? join(publicDir, 'index.html') : join(publicDir, pathname);
  const contentType =
    extname(filePath) === '.css'
      ? 'text/css; charset=utf-8'
      : extname(filePath) === '.js'
        ? 'application/javascript; charset=utf-8'
        : 'text/html; charset=utf-8';

  try {
    response.writeHead(200, { 'content-type': contentType });
    response.end(readFileSync(filePath));
  } catch {
    sendText(response, 404, 'Not found');
  }
}

const server = createServer((request, response) => {
  void (async () => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);

      if (url.pathname === '/callback') {
        serveStatic(response, '/index.html');
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url);
        return;
      }

      serveStatic(response, url.pathname);
    } catch (error) {
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } else {
        response.end();
      }
    }
  })();
});

server.listen(port, host, () => {
  console.log(`Agent Passport full demo: http://${host}:${port}`);
  console.log(`Composio configured: ${composio ? 'yes' : 'no'}`);
});
