import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore, firebaseAuth } from '../config/firebase';

export const SESSION_COOKIE_NAME = 'inee_session';
export const SESSION_HEADER_NAME = 'x-session-id';
export const SESSIONS_COLLECTION = 'user_sessions';

const SESSION_DURATION_HOURS = Number(process.env.SESSION_DURATION_HOURS) || 24;
export const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;

export interface UserSessionRecord {
  uid: string;
  loginAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  active: boolean;
}

export type SessionInvalidReason =
  | 'missing'
  | 'not_found'
  | 'inactive'
  | 'mismatch'
  | 'expired';

export type SessionValidationResult =
  | { valid: true; sessionId: string; loginAt: Date; expiresAt: Date }
  | { valid: false; reason: SessionInvalidReason };

const toDate = (value: FirebaseFirestore.Timestamp | Date | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

export const getSessionIdFromRequest = (req: Request): string | undefined => {
  const headerValue = req.headers[SESSION_HEADER_NAME];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return undefined;
};

export const attachSessionCookie = (
  res: Response,
  sessionId: string,
  expiresAt: Date
): void => {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
};

const deactivatePreviousSession = async (
  uid: string,
  previousSessionId?: string
): Promise<void> => {
  if (!previousSessionId) return;

  await firestore.collection(SESSIONS_COLLECTION).doc(previousSessionId).set(
    {
      active: false,
      invalidatedAt: FieldValue.serverTimestamp(),
      invalidationReason: 'replaced_by_new_login',
    },
    { merge: true }
  );

  console.log(
    `[SESSION] Sesión anterior invalidada — uid=${uid}, sessionId=${previousSessionId}`
  );
};

export const createUserSession = async (
  uid: string,
  res?: Response
): Promise<{ sessionId: string; loginAt: Date; expiresAt: Date }> => {
  const userRef = firestore.collection('users').doc(uid);
  const userDoc = await userRef.get();
  const previousSessionId = userDoc.data()?.activeSessionId as string | undefined;

  await deactivatePreviousSession(uid, previousSessionId);

  const loginAt = new Date();
  const expiresAt = new Date(loginAt.getTime() + SESSION_DURATION_MS);
  const sessionId = randomUUID();

  const batch = firestore.batch();
  const sessionRef = firestore.collection(SESSIONS_COLLECTION).doc(sessionId);

  batch.set(sessionRef, {
    uid,
    loginAt: Timestamp.fromDate(loginAt),
    expiresAt: Timestamp.fromDate(expiresAt),
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(
    userRef,
    {
      activeSessionId: sessionId,
      sessionLoginAt: Timestamp.fromDate(loginAt),
      sessionExpiresAt: Timestamp.fromDate(expiresAt),
      ultimoLogin: Timestamp.fromDate(loginAt),
    },
    { merge: true }
  );

  await batch.commit();

  if (res) {
    attachSessionCookie(res, sessionId, expiresAt);
  }

  console.log(
    `[SESSION] Login exitoso — uid=${uid}, sessionId=${sessionId}, loginAt=${loginAt.toISOString()}, expiresAt=${expiresAt.toISOString()}`
  );

  return { sessionId, loginAt, expiresAt };
};

export const invalidateUserSession = async (
  uid: string,
  sessionId: string,
  reason: 'expired' | 'logout' | 'invalid' = 'invalid'
): Promise<void> => {
  const batch = firestore.batch();

  batch.set(
    firestore.collection(SESSIONS_COLLECTION).doc(sessionId),
    {
      active: false,
      invalidatedAt: FieldValue.serverTimestamp(),
      invalidationReason: reason,
    },
    { merge: true }
  );

  batch.set(
    firestore.collection('users').doc(uid),
    {
      activeSessionId: FieldValue.delete(),
      sessionLoginAt: FieldValue.delete(),
      sessionExpiresAt: FieldValue.delete(),
    },
    { merge: true }
  );

  await batch.commit();

  try {
    await firebaseAuth.revokeRefreshTokens(uid);
    console.log(`[SESSION] Tokens de Firebase revocados — uid=${uid}, motivo=${reason}`);
  } catch (error) {
    console.error(`[SESSION] Error al revocar tokens — uid=${uid}:`, error);
  }
};

export const validateUserSession = async (
  uid: string,
  sessionIdFromRequest?: string
): Promise<SessionValidationResult> => {
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    console.warn(`[SESSION] Sesión inválida — uid=${uid}, motivo=usuario_no_encontrado`);
    return { valid: false, reason: 'not_found' };
  }

  const userData = userDoc.data();
  const activeSessionId = userData?.activeSessionId as string | undefined;

  if (!activeSessionId) {
    console.warn(`[SESSION] Sesión inválida — uid=${uid}, motivo=sin_sesion_activa`);
    return { valid: false, reason: 'missing' };
  }

  if (sessionIdFromRequest && sessionIdFromRequest !== activeSessionId) {
    console.warn(
      `[SESSION] Sesión inválida — uid=${uid}, sessionId=${sessionIdFromRequest}, motivo=no_coincide_con_sesion_activa`
    );
    return { valid: false, reason: 'mismatch' };
  }

  const sessionId = sessionIdFromRequest || activeSessionId;
  const sessionDoc = await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).get();

  if (!sessionDoc.exists) {
    console.warn(
      `[SESSION] Sesión inválida — uid=${uid}, sessionId=${sessionId}, motivo=documento_no_encontrado`
    );
    return { valid: false, reason: 'not_found' };
  }

  const session = sessionDoc.data() as UserSessionRecord;

  if (!session.active) {
    console.warn(
      `[SESSION] Sesión inválida — uid=${uid}, sessionId=${sessionId}, motivo=inactiva`
    );
    return { valid: false, reason: 'inactive' };
  }

  if (session.uid !== uid) {
    console.warn(
      `[SESSION] Sesión inválida — uid=${uid}, sessionId=${sessionId}, motivo=uid_no_coincide`
    );
    return { valid: false, reason: 'mismatch' };
  }

  const loginAt = toDate(session.loginAt);
  const expiresAt = toDate(session.expiresAt);

  if (!loginAt || !expiresAt) {
    console.warn(
      `[SESSION] Sesión inválida — uid=${uid}, sessionId=${sessionId}, motivo=fechas_invalidas`
    );
    return { valid: false, reason: 'not_found' };
  }

  if (Date.now() > expiresAt.getTime()) {
    console.warn(
      `[SESSION] Sesión expirada — uid=${uid}, sessionId=${sessionId}, loginAt=${loginAt.toISOString()}, expiresAt=${expiresAt.toISOString()}`
    );
    await invalidateUserSession(uid, sessionId, 'expired');
    return { valid: false, reason: 'expired' };
  }

  return {
    valid: true,
    sessionId,
    loginAt,
    expiresAt,
  };
};

export const getSessionErrorMessage = (reason: SessionInvalidReason): string => {
  switch (reason) {
    case 'expired':
      return 'Sesión expirada. Volvé a iniciar sesión.';
    case 'missing':
    case 'not_found':
    case 'inactive':
    case 'mismatch':
    default:
      return 'Sesión inválida. Volvé a iniciar sesión.';
  }
};

export const buildSessionAuthPayload = (session: {
  sessionId: string;
  expiresAt: Date;
}) => ({
  sessionId: session.sessionId,
  sessionExpiresAt: session.expiresAt.toISOString(),
});
