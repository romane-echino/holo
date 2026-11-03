import { api, process } from '@codenotch/process';
import { HoloDocument } from '../tables/holo-document.table';
import { HoloUpdate } from '../tables/holo-update.table';
import { MAX_PENDING_UPDATES } from '../lib/realtime';

export type DocumentStateOutput = {
    /** État Yjs compacté (base64), null avant la première compaction */
    state: string | null;
    /** Version à rappeler lors de la prochaine compaction */
    version: number;
    /** Époque de la session (voir HoloDocument.Epoch) ; null si le document n'existe pas encore */
    epoch: string | null;
    /** Updates reçus depuis la compaction, dans l'ordre d'arrivée */
    updates: { id: string; update: string }[];
};

/** État d'un document pour un participant qui (re)joint : état compacté + journal. */
export const getState = process({
    id: 'GetState',
    description: 'État courant d\'un document : dernier état compacté et modifications suivantes',
    kind: 'ephemeral',
    auth: { scope: 'internal' },
    trigger: api.get('/docs/{id:guid}/state'),
    run: async (ctx, input: { id: string }): Promise<DocumentStateOutput> => {
        const documentId = input.id.toLowerCase();
        const document = await ctx.table(HoloDocument).read(documentId);
        if (!document) return { state: null, version: 0, epoch: null, updates: [] };
        const updates = await ctx.table(HoloUpdate)
            .filter((u) => u.DocumentId.Equal(documentId))
            .select((u) => ({ id: u.Id, update: u.Update, at: u.CreatedAt }))
            .orderBy('at', 'ASC')
            .limit(MAX_PENDING_UPDATES)
            .run();
        return {
            state: document.State ?? null,
            version: Number(document.Version ?? 0),
            epoch: document.Epoch,
            updates: updates.map((row) => ({ id: row.id, update: row.update })),
        };
    },
});
