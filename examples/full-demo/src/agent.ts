import type { AccessGrant } from '@agent-passport/sdk';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
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
  startupContext: {
    profile: string;
    connectedApps: string[];
    connections: AgentManifestTool[];
  };
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

function isFunctionToolCall(
  toolCall: unknown,
): toolCall is { id: string; function: { name: string; arguments: string } } {
  if (!toolCall || typeof toolCall !== 'object') {
    return false;
  }

  return (
    'id' in toolCall &&
    'function' in toolCall &&
    typeof (toolCall as { id?: unknown }).id === 'string' &&
    typeof (toolCall as { function?: { name?: unknown } }).function?.name === 'string'
  );
}

export async function runGmailAgentMission(
  composio: ComposioAdapter,
  userId: string,
  grant: AccessGrant,
  app = 'gmail',
): Promise<AgentRunResult> {
  const mission = `Use the user-approved ${grant.profile.name} profile to run one read-only ${app} check.`;
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
  const mission = `Inspect the ${grant.profile.name} profile, list available provider tools, and execute safe read-only checks across connected apps.`;
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
      `Use the ${grant.profile.name} profile handoff references, inspect provider tools, then execute read-only provider calls without touching raw OAuth tokens.`,
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
  const toolCalls: ChatAgentResult['toolCalls'] = [];

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for the real chat agent demo.');
  }

  if (readyConnections.length === 0) {
    throw new Error(`The ${grant.profile.name} profile does not have any ready connected apps yet.`);
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.AGENT_PASSPORT_CHAT_MODEL ?? 'gpt-4.1-mini';
  const tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'list_passport_tools',
        description:
          'List the connected apps in the user passport and the available provider tools for those apps.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'execute_provider_readonly_tool',
        description:
          'Execute one safe read-only tool through the credential provider for a connected app. Use only when the user asks you to run, check, fetch, read, or prove something with an app.',
        parameters: {
          type: 'object',
          properties: {
            app: {
              type: 'string',
              enum: connectedApps,
              description: 'The connected app to use.',
            },
          },
          required: ['app'],
          additionalProperties: false,
        },
      },
    },
  ];
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are the Agent Passport demo agent. Talk naturally. You have access to the selected Agent Passport profile context below, but never raw OAuth tokens.

Selected profile startup context:
${JSON.stringify(
        {
          profile: grant.profile.name,
          connectedApps,
          connections: manifest.tools,
        },
        null,
        2,
      )}

Use this startup context to answer basic questions about which apps and providers are available. If the user asks for the broader provider tool catalog, call list_passport_tools. If the user asks you to actually use an app, call execute_provider_readonly_tool. If the user asks a normal question, answer normally. Do not dump JSON unless it helps. Be concise.`,
    },
    ...history.slice(-10).map((message): ChatCompletionMessageParam => ({
      role: message.role === 'agent' ? 'assistant' : 'user',
      content: message.content,
    })),
    {
      role: 'user',
      content: prompt,
    },
  ];

  let selectedApp: string | undefined;
  let executedProviderTool = false;

  for (let turn = 0; turn < 4; turn += 1) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages,
      tools,
      tool_choice: 'auto',
    });
    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage) {
      throw new Error('The model did not return a message.');
    }

    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls?.length) {
      return {
        prompt,
        answer: assistantMessage.content ?? '',
        selectedApp,
        intent: executedProviderTool ? 'execute_tool' : 'answer',
        manifest,
        startupContext: {
          profile: grant.profile.name,
          connectedApps,
          connections: manifest.tools,
        },
        toolCalls,
        rawTokenLeaked: containsRawTokenShape({ grant, manifest, messages }),
      };
    }

    for (const toolCall of assistantMessage.tool_calls) {
      if (!isFunctionToolCall(toolCall)) {
        throw new Error('The model returned a non-function tool call.');
      }

      const toolName = toolCall.function.name;
      let output: unknown;

      if (toolName === 'list_passport_tools') {
        for (const app of connectedApps) {
          if (!availableTools[app]) {
            availableTools[app] = (await composio.listTools(app)).slice(0, 12);
          }
        }

        output = {
          connectedApps,
          availableTools,
        };
        toolCalls.push({
          name: 'list_passport_tools',
          input: {},
          output,
        });
      } else if (toolName === 'execute_provider_readonly_tool') {
        const args = parseJsonObject(toolCall.function.arguments || '{}');
        const app = getString(args.app);
        const selectedConnection =
          readyConnections.find((connection) => connection.app === app) ?? readyConnections[0];
        const connectedAccountId = selectedConnection.handoffRef.connectedAccountId;

        if (typeof connectedAccountId !== 'string') {
          throw new Error(`The ${selectedConnection.app} handoff is missing a connected account id.`);
        }

        const execution = await composio.executeReadOnlyTool(
          userId,
          selectedConnection.app,
          connectedAccountId,
        );
        output = {
          app: selectedConnection.app,
          toolSlug: execution.toolSlug,
          resultSummary: summarizeProviderResult(selectedConnection.app, execution.result),
          note: 'Executed through Composio using a provider handoff reference. No raw OAuth token was exposed to Agent Passport.',
        };
        selectedApp = selectedConnection.app;
        executedProviderTool = true;
        toolCalls.push({
          name: execution.toolSlug,
          app: selectedConnection.app,
          input: {
            connectedAccountId,
            mode: 'read-only',
          },
          output,
        });
      } else {
        output = { error: `Unknown tool: ${toolName}` };
        toolCalls.push({
          name: toolName,
          error: `Unknown tool: ${toolName}`,
        });
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      });
    }
  }

  throw new Error('The model exceeded the chat tool-call turn limit.');
}
