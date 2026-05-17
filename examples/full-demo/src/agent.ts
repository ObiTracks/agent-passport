import type { AccessGrant } from '@agent-passport/sdk';
import type { ComposioAdapter } from './composio-adapter.js';

interface AgentManifestTool {
  app: string;
  provider: string;
  status: string;
  handoffRef: Record<string, unknown>;
}

export interface AgentRunResult {
  mission: string;
  executedToolSlug?: string;
  availableTools?: Record<string, string[]>;
  executions?: Array<{
    app: string;
    connectedAccountId: string;
    toolSlug?: string;
    successful: boolean;
    resultSummary?: unknown;
    error?: string;
  }>;
  manifest: {
    profile: string;
    tools: AgentManifestTool[];
  };
  decision: string;
  rawTokenLeaked: boolean;
  providerResult: unknown;
}

export interface ChatAgentResult {
  prompt: string;
  answer: string;
  selectedApp?: string;
  manifest: AgentRunResult['manifest'];
  toolCalls: Array<{
    name: string;
    app?: string;
    input?: Record<string, unknown>;
    output?: unknown;
    error?: string;
  }>;
  rawTokenLeaked: boolean;
}

function createManifest(grant: AccessGrant): AgentRunResult['manifest'] {
  return {
    profile: grant.profile.name,
    tools: grant.connections.map((connection) => ({
      app: connection.app,
      provider: connection.provider,
      status: connection.status,
      handoffRef: {
        type: connection.handoff.type,
        connectedAccountId: connection.handoff.connectedAccountId,
      },
    })),
  };
}

function containsRawTokenShape(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();
  return ['access_token', 'refresh_token', 'client_secret', 'api_key'].some((tokenKey) =>
    serialized.includes(tokenKey),
  );
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function summarizeProviderResult(app: string, value: unknown): unknown {
  const record = getRecord(value);
  const data = getRecord(record.data);
  const error = record.error ?? null;
  const successful = record.successful ?? false;
  const logId = record.logId;

  if (app === 'gmail') {
    return {
      successful,
      error,
      logId,
      emailAddress: data.emailAddress,
      messagesTotal: data.messagesTotal,
      threadsTotal: data.threadsTotal,
    };
  }

  if (app === 'googlecalendar') {
    const eventData = getRecord(data.event_data);
    const events = Array.isArray(eventData.event_data) ? eventData.event_data : [];

    return {
      successful,
      error,
      logId,
      calendar: data.summary,
      eventCount: events.length,
      note: eventData.note,
    };
  }

  return {
    successful,
    error,
    logId,
    dataKeys: Object.keys(data).slice(0, 12),
  };
}

export async function runGmailAgentMission(
  composio: ComposioAdapter,
  userId: string,
  grant: AccessGrant,
  app = 'gmail',
): Promise<AgentRunResult> {
  const mission = `Use the user-approved Default profile to run one read-only ${app} check.`;
  const manifest = createManifest(grant);
  const connection = manifest.tools.find(
    (tool) => tool.app === app && tool.provider === 'composio' && tool.status === 'ready',
  );

  if (!connection) {
    throw new Error(`The grant does not include a ready ${app} connection.`);
  }

  const connectedAccountId = connection.handoffRef.connectedAccountId;

  if (typeof connectedAccountId !== 'string') {
    throw new Error(`The ${app} handoff is missing a Composio connected account id.`);
  }

  const providerResult = await composio.executeReadOnlyTool(userId, app, connectedAccountId);

  return {
    mission,
    executedToolSlug: providerResult.toolSlug,
    manifest,
    decision: `Use the ${app} handoff reference with Composio. Do not touch raw OAuth tokens.`,
    rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    providerResult: providerResult.result,
  };
}

export async function runDefaultPassportAgentMission(
  composio: ComposioAdapter,
  userId: string,
  grant: AccessGrant,
): Promise<AgentRunResult> {
  const mission =
    'Inspect the Default passport, list available provider tools, and execute safe read-only checks across connected apps.';
  const manifest = createManifest(grant);
  const readyConnections = manifest.tools.filter(
    (tool) => tool.provider === 'composio' && tool.status === 'ready',
  );
  const apps = [...new Set(readyConnections.map((tool) => tool.app))];
  const availableTools: Record<string, string[]> = {};

  for (const app of apps) {
    try {
      availableTools[app] = (await composio.listTools(app)).slice(0, 12);
    } catch (error) {
      availableTools[app] = [`Could not list tools: ${error instanceof Error ? error.message : 'unknown error'}`];
    }
  }

  const executions: AgentRunResult['executions'] = [];

  for (const connection of readyConnections.slice(0, 3)) {
    const connectedAccountId = connection.handoffRef.connectedAccountId;

    if (typeof connectedAccountId !== 'string') {
      executions.push({
        app: connection.app,
        connectedAccountId: '(missing)',
        successful: false,
        error: 'Missing connected account id.',
      });
      continue;
    }

    try {
      const execution = await composio.executeReadOnlyTool(userId, connection.app, connectedAccountId);
      executions.push({
        app: connection.app,
        connectedAccountId,
        toolSlug: execution.toolSlug,
        successful: true,
        resultSummary: summarizeProviderResult(connection.app, execution.result),
      });
    } catch (error) {
      executions.push({
        app: connection.app,
        connectedAccountId,
        successful: false,
        error: error instanceof Error ? error.message : 'Unknown execution error',
      });
    }
  }

  return {
    mission,
    manifest,
    availableTools,
    executions,
    decision:
      'Use the Default passport handoff references, inspect provider tools, then execute read-only provider calls without touching raw OAuth tokens.',
    rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    providerResult: executions,
  };
}

export async function runPassportChatMission(
  composio: ComposioAdapter,
  userId: string,
  grant: AccessGrant,
  prompt: string,
): Promise<ChatAgentResult> {
  const manifest = createManifest(grant);
  const readyConnections = manifest.tools.filter(
    (tool) => tool.provider === 'composio' && tool.status === 'ready',
  );
  const normalizedPrompt = prompt.toLowerCase();
  const selectedConnection =
    readyConnections.find((connection) => normalizedPrompt.includes(connection.app.toLowerCase())) ??
    readyConnections.find((connection) =>
      connection.app.toLowerCase().includes(normalizedPrompt.trim()),
    ) ??
    readyConnections[0];
  const toolCalls: ChatAgentResult['toolCalls'] = [
    {
      name: 'agent_passport.read_grant',
      output: {
        profile: grant.profile.name,
        connectedApps: readyConnections.map((connection) => connection.app),
      },
    },
  ];

  if (!selectedConnection) {
    return {
      prompt,
      answer: 'The Default passport does not have any ready connected apps yet.',
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }

  const connectedAccountId = selectedConnection.handoffRef.connectedAccountId;

  if (typeof connectedAccountId !== 'string') {
    toolCalls.push({
      name: 'agent_passport.resolve_provider_handoff',
      app: selectedConnection.app,
      error: 'Missing Composio connected account id.',
    });

    return {
      prompt,
      answer: `I found ${selectedConnection.app}, but its provider handoff is incomplete.`,
      selectedApp: selectedConnection.app,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }

  try {
    const tools = await composio.listTools(selectedConnection.app);
    toolCalls.push({
      name: 'composio.tools.list',
      app: selectedConnection.app,
      input: { toolkit: selectedConnection.app },
      output: tools.slice(0, 12),
    });

    const execution = await composio.executeReadOnlyTool(
      userId,
      selectedConnection.app,
      connectedAccountId,
    );
    const resultSummary = summarizeProviderResult(selectedConnection.app, execution.result);

    toolCalls.push({
      name: execution.toolSlug,
      app: selectedConnection.app,
      input: {
        connectedAccountId,
        mode: 'read-only',
      },
      output: resultSummary,
    });

    return {
      prompt,
      answer: `I used your Default passport to call ${execution.toolSlug} through Composio for ${selectedConnection.app}. Agent Passport only passed the provider handoff reference; it did not receive raw OAuth tokens.`,
      selectedApp: selectedConnection.app,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  } catch (error) {
    toolCalls.push({
      name: 'composio.tools.execute',
      app: selectedConnection.app,
      input: { connectedAccountId, mode: 'read-only' },
      error: error instanceof Error ? error.message : 'Unknown execution error',
    });

    return {
      prompt,
      answer: `I found ${selectedConnection.app} in your Default passport, but the provider tool call failed.`,
      selectedApp: selectedConnection.app,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }
}
