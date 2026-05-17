import { Composio } from '@composio/core';

export interface ConnectedAccountSummary {
  id: string;
  app: string;
  status: string;
  label?: string;
}

export interface ConnectableAppSummary {
  authConfigId: string;
  app: string;
  name: string;
}

export interface ToolExecutionResult {
  toolSlug: string;
  result: unknown;
}

export class ComposioAdapter {
  private readonly client: Composio;

  constructor(apiKey: string) {
    this.client = new Composio({ apiKey });
  }

  async listConnectableApps(): Promise<ConnectableAppSummary[]> {
    const response = await this.client.authConfigs.list({
      limit: 100,
    });

    return this.getItems(response)
      .filter((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        return (item as Record<string, unknown>).disabled !== true;
      })
      .map((item) => {
        const app = this.getAuthConfigToolkitSlug(item);
        const authConfigId =
          this.getObjectStringValue(item, 'id') ?? this.getObjectStringValue(item, 'nanoid') ?? '';

        return {
          authConfigId,
          app,
          name: this.getObjectStringValue(item, 'name') ?? app,
        };
      })
      .filter((app) => app.authConfigId && app.app)
      .sort((a, b) => a.app.localeCompare(b.app));
  }

  async createConnectUrl(userId: string, app: string, callbackUrl: string): Promise<string> {
    const authConfigId = await this.resolveAuthConfigId(app);

    const request = await this.client.connectedAccounts.link(userId, authConfigId, {
      callbackUrl,
      allowMultiple: true,
    });

    const redirectUrl = this.getObjectStringValue(request, 'redirectUrl');

    if (!redirectUrl) {
      throw new Error('Composio did not return a redirectUrl.');
    }

    return redirectUrl;
  }

  async listConnectedAccounts(userId: string): Promise<ConnectedAccountSummary[]> {
    const response = await this.client.connectedAccounts.list({
      userIds: [userId],
      limit: 100,
    });

    const items = this.getItems(response);

    return items.map((item) => ({
      id: this.getObjectStringValue(item, 'id') ?? '',
      app: this.getToolkitSlug(item),
      status: (this.getObjectStringValue(item, 'status') ?? 'unknown').toLowerCase(),
      label: this.getDisplayLabel(item) ?? this.getObjectStringValue(item, 'id'),
    }));
  }

  async listTools(app: string): Promise<string[]> {
    const rawTools = await this.client.tools.getRawComposioTools({
      toolkits: [app],
      limit: 100,
    });

    const items = Array.isArray(rawTools) ? rawTools : this.getItems(rawTools);

    return items
      .map((tool) => this.getObjectStringValue(tool, 'slug') ?? this.getObjectStringValue(tool, 'name'))
      .filter((tool): tool is string => Boolean(tool));
  }

  async executeReadOnlyTool(
    userId: string,
    app: string,
    connectedAccountId: string,
  ): Promise<ToolExecutionResult> {
    const toolSlug = process.env.COMPOSIO_DEMO_TOOL_SLUG ?? (await this.chooseReadOnlyTool(app));
    const result = await this.client.tools.execute(toolSlug, {
      userId,
      connectedAccountId,
      arguments: this.parseToolArguments(),
      dangerouslySkipVersionCheck: true,
    });

    return { toolSlug, result };
  }

  private async chooseReadOnlyTool(app: string): Promise<string> {
    const tools = await this.listTools(app);
    const upperApp = app.toUpperCase();
    const preferred = [
      `${upperApp}_GET_PROFILE`,
      `${upperApp}_GET_USER`,
      `${upperApp}_LIST_USERS`,
      `${upperApp}_LIST_EVENTS`,
      `${upperApp}_FIND_EVENT`,
      `${upperApp}_SEARCH_EMAILS`,
      `${upperApp}_FETCH_EMAILS`,
    ];
    const match = preferred.find((tool) => tools.includes(tool));

    if (match) {
      return match;
    }

    const fallback = tools.find((tool) => /(GET|LIST|FETCH|SEARCH|READ)/.test(tool));

    if (!fallback) {
      throw new Error(`No read-only ${app} tool found in Composio.`);
    }

    return fallback;
  }

  private parseToolArguments(): Record<string, unknown> {
    const raw = process.env.COMPOSIO_DEMO_TOOL_ARGS_JSON;

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('COMPOSIO_DEMO_TOOL_ARGS_JSON must be a JSON object.');
    }

    return parsed as Record<string, unknown>;
  }

  private async resolveAuthConfigId(toolkit: string): Promise<string> {
    const envKey = `COMPOSIO_${toolkit.toUpperCase()}_AUTH_CONFIG_ID`;
    const envAuthConfigId = process.env[envKey];

    if (envAuthConfigId) {
      return envAuthConfigId;
    }

    const response = await this.client.authConfigs.list({
      toolkit,
      limit: 100,
    });

    const items = this.getItems(response).filter((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      return (item as Record<string, unknown>).disabled !== true;
    });
    const first = items[0];
    const id = this.getObjectStringValue(first, 'id') ?? this.getObjectStringValue(first, 'nanoid');

    if (!id) {
      throw new Error(`No Composio auth config found for ${toolkit}.`);
    }

    return id;
  }

  private getAuthConfigToolkitSlug(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return '';
    }

    const record = value as Record<string, unknown>;
    const toolkit = record.toolkit;

    if (toolkit && typeof toolkit === 'object') {
      const slug = this.getObjectStringValue(toolkit, 'slug');
      if (slug) {
        return slug.toLowerCase();
      }
    }

    return (
      this.getObjectStringValue(value, 'toolkitSlug') ??
      this.getObjectStringValue(value, 'toolkit_slug') ??
      this.getObjectStringValue(value, 'toolkit')
    )?.toLowerCase() ?? '';
  }

  private getToolkitSlug(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return '';
    }

    const record = value as Record<string, unknown>;
    const toolkit = record.toolkit;

    if (toolkit && typeof toolkit === 'object') {
      const slug = this.getObjectStringValue(toolkit, 'slug');
      if (slug) {
        return slug.toLowerCase();
      }
    }

    return (
      this.getObjectStringValue(value, 'toolkitSlug') ??
      this.getObjectStringValue(value, 'toolkit_slug') ??
      ''
    ).toLowerCase();
  }

  private getDisplayLabel(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const member = record.member;

    if (member && typeof member === 'object') {
      return (
        this.getObjectStringValue(member, 'email') ??
        this.getObjectStringValue(member, 'identifier') ??
        this.getObjectStringValue(member, 'username') ??
        this.getObjectStringValue(member, 'name')
      );
    }

    return this.getObjectStringValue(value, 'alias');
  }

  private getItems(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const items = (value as Record<string, unknown>).items;
    return Array.isArray(items) ? items : [];
  }

  private getObjectStringValue(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const output = (value as Record<string, unknown>)[key];
    return typeof output === 'string' ? output : undefined;
  }
}
