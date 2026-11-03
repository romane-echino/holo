import { api, process } from '@codenotch/process';
import { documentSignal } from '../lib/realtime';

/**
 * Flux SSE d'un document : un évènement `signal` par update Yjs
 * (`holo.doc.<id>.update`) ou message de présence (`holo.doc.<id>.awareness`).
 * Le premier évènement `ready` marque le début du suivi : le client recharge
 * alors l'état (GET /state) pour combler une éventuelle coupure.
 */
export const streamDocument = process({
    id: 'StreamDocument',
    description: 'Flux en direct des modifications et de la présence sur un document',
    kind: 'ephemeral',
    auth: { scope: 'internal' },
    trigger: api.get('/docs/{id:guid}/stream'),
    run: async (ctx, input: { id: string }): Promise<void> => {
        await ctx.streamSignals([documentSignal(input.id)]);
    },
});
