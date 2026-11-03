import { api, process } from '@codenotch/process';
import { ConflictError } from '@codenotch/orm';
import { HoloDocument } from '../tables/holo-document.table';
import { HoloUpdate } from '../tables/holo-update.table';
import { documentSignal, MAX_UPDATE_BASE64_LENGTH, requireBase64, requireClientId } from '../lib/realtime';

/**
 * Reçoit un update Yjs : il est journalisé (pour les clients qui rejoindront
 * le document) puis diffusé aux participants connectés.
 */
export const pushUpdate = process({
    id: 'PushUpdate',
    description: 'Enregistre et diffuse une modification Yjs d\'un document',
    kind: 'ephemeral',
    // Public : le contenu est chiffré de bout en bout par les postes (clé dérivée du
    // dépôt git) et les identifiants de documents sont indevinables sans cette clé.
    auth: { scope: 'public' },
    trigger: api.post('/docs/{id:guid}/updates'),
    run: async (ctx, input: { id: string; update: string; clientId: string; workspace?: string; path?: string }): Promise<{ id: string }> => {
        const documentId = input.id.toLowerCase();
        const update = requireBase64(input.update, 'update', MAX_UPDATE_BASE64_LENGTH);
        const clientId = requireClientId(input.clientId);
        const db = ctx.data;

        if (!(await ctx.table(HoloDocument).read(documentId))) {
            try {
                await db.write(HoloDocument).insert({
                    Id: documentId,
                    Workspace: String(input.workspace ?? '').slice(0, 500),
                    Path: String(input.path ?? '').slice(0, 1000),
                    State: null,
                    Epoch: ctx.uuid(),
                }).run();
            } catch (error) {
                // Deux participants ont créé le document au même instant : il existe, c'est ce qui compte.
                if (!(error instanceof ConflictError && error.code === 'CNQL029')) throw error;
            }
        }

        const updateId = ctx.uuid();
        await db.write(HoloUpdate).insert({ Id: updateId, Update: update, ClientId: clientId, DocumentId: documentId }).run();
        await ctx.sendSignal(`${documentSignal(documentId)}.update`, { u: update, c: clientId, i: updateId });
        return { id: updateId };
    },
});
