import { createRemoteJWKSet, jwtVerify } from "jose";

export interface VerifiedStudentToken {
  readonly uid: string;
}

function configuredProjectId(): string | null {
  return process.env["FIREBASE_PROJECT_ID"] ?? process.env["VITE_FIREBASE_PROJECT_ID"] ?? null;
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  return match?.[1] ?? null;
}

const keySetsByProject = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(projectId: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = keySetsByProject.get(projectId);
  if (existing) {
    return existing;
  }

  const keySet = createRemoteJWKSet(
    new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
  );
  keySetsByProject.set(projectId, keySet);
  return keySet;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function anonymousProvider(payload: Readonly<Record<string, unknown>>): boolean {
  const firebase = payload["firebase"];
  if (!isRecord(firebase)) {
    return false;
  }

  return firebase["sign_in_provider"] === "anonymous";
}

export async function verifyStudentToken(authorization: string | undefined): Promise<VerifiedStudentToken | null> {
  const token = bearerToken(authorization);
  const projectId = configuredProjectId();
  if (!token || !projectId) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, keySetFor(projectId), {
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`
    });
    const uid = verified.payload.sub;
    return typeof uid === "string" && anonymousProvider(verified.payload) ? { uid } : null;
  } catch {
    return null;
  }
}
