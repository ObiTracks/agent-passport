import type { AccessGrant, PassportConnection } from '@agent-passport/sdk';
import { randomUUID } from 'node:crypto';

export interface PassportUser {
  id: string;
  email: string;
}

export interface ProviderConnection {
  app: string;
  provider: 'composio';
  connectedAccountId: string;
  label?: string;
  status: 'ready' | 'needs_auth';
  scopes: string[];
}

export interface PassportProfileRecord {
  id: string;
  name: string;
  connectionIds: string[];
  allowedClients: Array<{
    id: string;
    name: string;
  }>;
}

const usersByEmail = new Map<string, PassportUser>();
const connectionsByUserId = new Map<string, ProviderConnection[]>();
const profilesByUserId = new Map<string, PassportProfileRecord[]>();

const defaultProfile = {
  id: 'profile_default',
  name: 'Default',
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createDemoUserId(email: string): string {
  const normalized = normalizeEmail(email);
  const encoded = Buffer.from(normalized).toString('base64url');
  return `agent_passport_demo_${encoded}`;
}

export function getOrCreateUser(email: string): PassportUser {
  const normalized = normalizeEmail(email);
  const existing = usersByEmail.get(normalized);

  if (existing) {
    return existing;
  }

  const user = {
    id: createDemoUserId(normalized),
    email: normalized,
  };

  usersByEmail.set(normalized, user);
  return user;
}

function connectionKey(connection: Pick<ProviderConnection, 'provider' | 'connectedAccountId'>): string {
  return `${connection.provider}:${connection.connectedAccountId}`;
}

function createDefaultProfile(): PassportProfileRecord {
  return {
    ...defaultProfile,
    connectionIds: [],
    allowedClients: [],
  };
}

export function getProfiles(userId: string): PassportProfileRecord[] {
  const existing = profilesByUserId.get(userId);

  if (existing) {
    return existing;
  }

  const profiles = [createDefaultProfile()];
  profilesByUserId.set(userId, profiles);
  return profiles;
}

export function createProfile(userId: string, name: string): PassportProfileRecord {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error('Profile name is required.');
  }

  const profiles = getProfiles(userId);
  const profile = {
    id: `profile_${randomUUID()}`,
    name: trimmedName,
    connectionIds: [],
    allowedClients: [],
  };

  profiles.push(profile);
  return profile;
}

export function setProfileConnection(
  userId: string,
  profileId: string,
  connectionId: string,
  enabled: boolean,
): PassportProfileRecord {
  const profile = getProfiles(userId).find((item) => item.id === profileId);

  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  if (profile.id === defaultProfile.id) {
    throw new Error('The Default profile automatically includes all ready connections.');
  }

  profile.connectionIds = enabled
    ? [...new Set([...profile.connectionIds, connectionId])]
    : profile.connectionIds.filter((id) => id !== connectionId);

  return profile;
}

export function saveConnection(userId: string, connection: ProviderConnection): void {
  const existingConnections = connectionsByUserId.get(userId) ?? [];
  const nextConnections = [
    ...existingConnections.filter(
      (existing) =>
        existing.provider !== connection.provider ||
        existing.app !== connection.app ||
        existing.connectedAccountId !== connection.connectedAccountId,
    ),
    connection,
  ];

  connectionsByUserId.set(userId, nextConnections);
}

export function getConnections(userId: string, profileId = defaultProfile.id): ProviderConnection[] {
  const connections = connectionsByUserId.get(userId) ?? [];

  if (profileId === defaultProfile.id) {
    return connections;
  }

  const profile = getProfiles(userId).find((item) => item.id === profileId);

  if (!profile) {
    return [];
  }

  return connections.filter((connection) => profile.connectionIds.includes(connectionKey(connection)));
}

export function getAllConnections(userId: string): ProviderConnection[] {
  return connectionsByUserId.get(userId) ?? [];
}

export function getConnectionId(connection: ProviderConnection): string {
  return connectionKey(connection);
}

function toPassportConnection(connection: ProviderConnection): PassportConnection {
  return {
    app: connection.app,
    provider: connection.provider,
    scopes: connection.scopes,
    status: connection.status,
    handoff: {
      type: 'composio_connected_account',
      connectedAccountId: connection.connectedAccountId,
      label: connection.label,
    },
  };
}

export function createAccessGrant(
  user: PassportUser,
  purpose: string,
  app?: string,
  profileId = defaultProfile.id,
): AccessGrant {
  const providerConnections = app
    ? getConnections(user.id, profileId).filter((connection) => connection.app === app)
    : getConnections(user.id, profileId);
  const connections = providerConnections.map(toPassportConnection);
  const profile = getProfiles(user.id).find((item) => item.id === profileId) ?? createDefaultProfile();

  return {
    id: `grant_${randomUUID()}`,
    accessRequestId: `request_${randomUUID()}`,
    status: connections.length > 0 ? 'approved' : 'pending',
    profile: {
      id: profile.id,
      name: profile.name,
    },
    connections,
  };
}
