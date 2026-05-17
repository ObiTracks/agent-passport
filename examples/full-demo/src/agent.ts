import type { AccessGrant } from '@agent-passport/sdk';
import OpenAI from 'openai';
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
  intent: 'answer' | 'list_tools' | 'execute_tool' | 'clarify';
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

export interface ChatHistoryMessage {
  role: 'user' | 'agent';
  content: string;
}

interface ChatPlan {
  intent: ChatAgentResult['intent'];
  selectedApp?: string;
  answer: string;
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseJsonObject(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(withoutFence) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model did not return a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getIntent(value: unknown): ChatPlan['intent'] {
  if (
    value === 'answer' ||
    value === 'list_tools' ||
    value === 'execute_tool' ||
    value === 'clarify'
  ) {
    return value;
  }

  return 'answer';
}

function createFallbackPlan(
  prompt: string,
  connectedApps: string[],
  availableTools: Record<string, string[]>,
): ChatPlan {
  const normalized = prompt.toLowerCase();
  const selectedApp =
    connectedApps.find((app) => normalized.includes(app.toLowerCase())) ?? connectedApps[0];
  const asksTools = /\b(tool|tools|capabilit|what.*got|what.*have|available)\b/i.test(prompt);
  const asksExecution = /\b(run|call|execute|use|check|test|fetch|get|read|show)\b/i.test(prompt);

  if (asksTools) {
    return {
      intent: 'list_tools',
      selectedApp,
      answer: createToolsAnswer(connectedApps, availableTools),
    };
  }

  if (asksExecution && selectedApp) {
    return {
      intent: 'execute_tool',
      selectedApp,
      answer: `I can run one safe read-only ${selectedApp} tool through Composio.`,
    };
  }

  return {
    intent: 'clarify',
    answer:
      'I can answer what connected apps/tools are available, or run one safe read-only provider tool from your Default passport. Tell me which app you want to use.',
  };
}

function createToolsAnswer(
  connectedApps: string[],
  availableTools: Record<string, string[]>,
): string {
  if (connectedApps.length === 0) {
    return 'Your Default passport does not have any ready connected apps yet.';
  }

  const lines = connectedApps.map((app) => {
    const tools = availableTools[app] ?? [];
    const preview = tools.length ? tools.slice(0, 8).join(', ') : 'No tools returned.';
    return `${app}: ${preview}`;
  });

  return `Your Default passport currently has ${connectedApps.join(', ')}. Available provider tools include:\n${lines.join('\n')}`;
}

async function createModelPlan(input: {
  prompt: string;
  history: ChatHistoryMessage[];
  connectedApps: string[];
  availableTools: Record<string, string[]>;
}): Promise<ChatPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.AGENT_PASSPORT_CHAT_MODEL ?? 'gpt-4.1-mini';
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are the Agent Passport demo agent. You are concise and literal. Decide whether the user is asking a question, asking what tools/apps are available, asking to execute a provider tool, or needs clarification. Never claim raw OAuth token access. Return only JSON with keys: intent, selectedApp, answer. intent must be one of answer, list_tools, execute_tool, clarify. selectedApp must be one of the connected apps when execution is needed.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentUserMessage: input.prompt,
          recentChatHistory: input.history.slice(-8),
          connectedApps: input.connectedApps,
          availableTools: input.availableTools,
          rules: [
            'If the user asks what tools/apps/capabilities you have, use list_tools.',
            'If the user says huh, asks what happened, or asks a general question, answer or clarify.',
            'Only use execute_tool when the user clearly asks to run/call/use/check/read/fetch something from a connected app.',
            'Prefer the app explicitly named by the user.',
          ],
        }),
      },
    ],
  });
  const content = response.choices[0]?.message.content;

  if (!content) {
    return null;
  }

  const parsed = parseJsonObject(content);
  const selectedApp = getString(parsed.selectedApp);

  return {
    intent: getIntent(parsed.intent),
    selectedApp: selectedApp && input.connectedApps.includes(selectedApp) ? selectedApp : undefined,
    answer: getString(parsed.answer) ?? '',
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
  history: ChatHistoryMessage[] = [],
): Promise<ChatAgentResult> {
  const manifest = createManifest(grant);
  const readyConnections = manifest.tools.filter(
    (tool) => tool.provider === 'composio' && tool.status === 'ready',
  );
  const connectedApps = uniqueStrings(readyConnections.map((connection) => connection.app));
  const availableTools: Record<string, string[]> = {};
  const toolCalls: ChatAgentResult['toolCalls'] = [
    {
      name: 'agent_passport.read_grant',
      output: {
        profile: grant.profile.name,
        connectedApps: readyConnections.map((connection) => connection.app),
      },
    },
  ];

  for (const app of connectedApps) {
    try {
      availableTools[app] = (await composio.listTools(app)).slice(0, 12);
    } catch (error) {
      availableTools[app] = [
        `Could not list tools: ${error instanceof Error ? error.message : 'unknown error'}`,
      ];
    }
  }

  const modelPlan =
    (await createModelPlan({
      prompt,
      history,
      connectedApps,
      availableTools,
    }).catch(() => null)) ?? createFallbackPlan(prompt, connectedApps, availableTools);
  const selectedConnection =
    readyConnections.find((connection) => connection.app === modelPlan.selectedApp) ??
    readyConnections.find((connection) => connection.app === connectedApps[0]);

  toolCalls.push({
    name: 'agent_passport.plan',
    output: modelPlan,
  });

  if (!selectedConnection) {
    return {
      prompt,
      answer: 'The Default passport does not have any ready connected apps yet.',
      intent: modelPlan.intent,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }

  if (modelPlan.intent === 'list_tools') {
    toolCalls.push({
      name: 'composio.tools.list',
      input: { apps: connectedApps },
      output: availableTools,
    });

    return {
      prompt,
      answer: modelPlan.answer || createToolsAnswer(connectedApps, availableTools),
      selectedApp: selectedConnection.app,
      intent: modelPlan.intent,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }

  if (modelPlan.intent !== 'execute_tool') {
    return {
      prompt,
      answer: modelPlan.answer || createFallbackPlan(prompt, connectedApps, availableTools).answer,
      selectedApp: selectedConnection.app,
      intent: modelPlan.intent,
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
      intent: modelPlan.intent,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }

  try {
    toolCalls.push({
      name: 'composio.tools.list',
      app: selectedConnection.app,
      input: { toolkit: selectedConnection.app },
      output: availableTools[selectedConnection.app] ?? [],
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
      answer:
        modelPlan.answer ||
        `I used your Default passport to call ${execution.toolSlug} through Composio for ${selectedConnection.app}. Agent Passport only passed the provider handoff reference; it did not receive raw OAuth tokens.`,
      selectedApp: selectedConnection.app,
      intent: modelPlan.intent,
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
      intent: modelPlan.intent,
      manifest,
      toolCalls,
      rawTokenLeaked: containsRawTokenShape({ grant, manifest }),
    };
  }
}
