import { api, process, ProcessError } from '@codenotch/process';
import { ConflictError, NotFoundError } from '@codenotch/orm';
import { HoloDocument } from '../tables/holo-document.table';
import { HoloUpdate } from '../tables/holo-update.table';
import { MAX_PENDING_UPDATES, MAX_UPDATE_BASE64_LENGTH, requireBase64 } from '../lib/realtime';

type CompactInput = {
    id: string;
    state: string;
    /** Version lue via GET /state (0 si le document n'existait pas) */
    expectedVersion: number;
    /** Updates intégrés dans `state`, à purger */
    mergedUpdateIds?: string[];
    /** Nouvelle session : nouvelle époque, tout le journal est purgé */
    reset?: boolean;
    workspace?: string;
    path?: string;
};

/**
 * Compaction : un client remplace l'état du document par la fusion qu'il a
 * calculée (état + updates lus via GET /state) et supprime les updates qu'il
 * y a intégrés. Avec `reset`, il démarre une nouvelle session à partir de son
 * fichier (il est seul sur le document). La version empêche deux écritures
 * concurrentes ; un update non purgé est simplement rejoué (Yjs est idempotent).
 */
export const compactState = process({
    id: 'CompactState',
    description: 'Remplace l\'état compacté d\'un document et purge les modifications intégrées',
    kind: 'ephemeral',
    // Public : le contenu est chiffré de bout en bout par les postes (clé dérivée du
    // dépôt git) et les identifiants de documents sont indevinables sans cette clé.
    auth: { scope: 'public' },
    trigger: api.put('/docs/{id:guid}/state'),
    run: async (ctx, input: CompactInput): Promise<{ version: number; epoch: string }> => {
        const documentId = input.id.toLowerCase();
        const state = requireBase64(input.state, 'state', MAX_UPDATE_BASE64_LENGTH);
        const db = ctx.data;
        const conflict = () => new ProcessError('holo.compactionConflict', { status: 409, message: 'Le document a changé entre-temps.' });

        const existing = await ctx.table(HoloDocument).read(documentId);
        if (!existing) {
            if (!input.reset) throw new ProcessError('holo.unknownDocument', { status: 404, message: 'Document inconnu.' });
            try {
                await db.write(HoloDocument).insert({
                    Id: documentId,
                    Workspace: String(input.workspace ?? '').slice(0, 500),
                    Path: String(input.path ?? '').slice(0, 1000),
                    State: state,
                    Epoch: ctx.uuid(),
                }).run();
            } catch (error) {
                if (error instanceof ConflictError && error.code === 'CNQL029') throw conflict();
                throw error;
            }
        } else {
            try {
                await db.write(HoloDocument)
                    .update(documentId, input.reset ? { State: state, Epoch: ctx.uuid() } : { State: state }, { ifVersion: input.expectedVersion })
                    .run();
            } catch (error) {
                if (error instanceof ConflictError && error.code === 'CNQL022') throw conflict();
                if (error instanceof NotFoundError) throw new ProcessError('holo.unknownDocument', { status: 404, message: 'Document inconnu.' });
                throw error;
            }

            const mergedIds = Array.isArray(input.mergedUpdateIds)
                ? input.mergedUpdateIds.filter((id) => typeof id === 'string').slice(0, MAX_PENDING_UPDATES)
                : [];
            if (input.reset) {
                await db.query(HoloUpdate).filter((u) => u.DocumentId.Equal(documentId)).delete({ maxAffected: '*' }).run();
            } else if (mergedIds.length > 0) {
                await db.query(HoloUpdate)
                    .filter((u) => u.Id.In(mergedIds).and(u.DocumentId.Equal(documentId)))
                    .delete({ maxAffected: mergedIds.length })
                    .run();
            }
        }

        const document = await ctx.table(HoloDocument).require(documentId);
        return { version: Number(document.Version ?? 0), epoch: document.Epoch };
    },
});
