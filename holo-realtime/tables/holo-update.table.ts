import { defineEntity, p, type InferEntity } from '@codenotch/orm';
import { HoloDocument } from './holo-document.table';

/**
 * Journal des updates Yjs reçus depuis la dernière compaction. Un client qui
 * rejoint le document charge l'état compacté puis rejoue ces updates
 * (l'application d'un update Yjs est idempotente et commutative).
 */
export const HoloUpdate = defineEntity({
    name: 'HoloUpdate',
    accessPolicy: {
        internal: {
            admin: { read: 'all', create: 'none', update: 'none', delete: 'all' },
            _other: { read: 'none', create: 'none', update: 'none', delete: 'none' },
        },
        external: { read: 'none', create: 'none', update: 'none', delete: 'none' },
        public: { read: 'none', create: 'none', update: 'none', delete: 'none' },
        system: {},
    },
    properties: {
        Id: p.uuid().primary(),
        CreatedAt: p.createdAt(),
        /** Update Yjs (base64) */
        Update: p.text(),
        /** Client Yjs émetteur (permet à chacun d'ignorer ses propres échos) */
        ClientId: p.string().maxLength(64),
        Document: () => p.belongsTo(HoloDocument, { key: 'DocumentId' }),
    },
});

export type IHoloUpdate = InferEntity<typeof HoloUpdate>;
