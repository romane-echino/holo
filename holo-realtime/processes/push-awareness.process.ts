import { api, process } from '@codenotch/process';
import { documentSignal, MAX_AWARENESS_BASE64_LENGTH, requireBase64, requireClientId } from '../lib/realtime';

/** Diffuse la présence d'un participant (nom, couleur, bloc édité). Rien n'est stocké. */
export const pushAwareness = process({
    id: 'PushAwareness',
    description: 'Diffuse la présence d\'un participant sur un document',
    kind: 'ephemeral',
    // Public : le contenu est chiffré de bout en bout par les postes (clé dérivée du
    // dépôt git) et les identifiants de documents sont indevinables sans cette clé.
    auth: { scope: 'public' },
    trigger: api.post('/docs/{id:guid}/awareness'),
    run: async (ctx, input: { id: string; awareness: string; clientId: string }): Promise<{ ok: true }> => {
        const awareness = requireBase64(input.awareness, 'awareness', MAX_AWARENESS_BASE64_LENGTH);
        const clientId = requireClientId(input.clientId);
        await ctx.sendSignal(`${documentSignal(input.id)}.awareness`, { a: awareness, c: clientId });
        return { ok: true };
    },
});
