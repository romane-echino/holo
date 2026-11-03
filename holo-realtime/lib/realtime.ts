import { ProcessError } from '@codenotch/process';

/** Préfixe des signaux du relais (les signaux sont partagés entre projets du runtime). */
export const SIGNAL_PREFIX = 'holo.doc';

/** Ref du flux d'un document : reçoit aussi `.update` et `.awareness` (refs hiérarchiques). */
export function documentSignal(documentId: string): string {
    return `${SIGNAL_PREFIX}.${documentId.toLowerCase()}`;
}

// Un update Yjs fait quelques dizaines d'octets ; l'état initial d'un gros
// document quelques centaines de Ko. Au-delà, c'est une erreur du client.
export const MAX_UPDATE_BASE64_LENGTH = 4 * 1024 * 1024;
export const MAX_AWARENESS_BASE64_LENGTH = 64 * 1024;
export const MAX_PENDING_UPDATES = 5000;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export function requireBase64(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
        throw new ProcessError('holo.invalidPayload', { status: 400, message: `${field} doit être une chaîne base64 non vide.` });
    }
    if (value.length > maxLength) {
        throw new ProcessError('holo.payloadTooLarge', { status: 413, message: `${field} dépasse la taille maximale (${maxLength} caractères).` });
    }
    return value;
}

export function requireClientId(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
        throw new ProcessError('holo.invalidClientId', { status: 400, message: 'clientId invalide.' });
    }
    return value;
}
