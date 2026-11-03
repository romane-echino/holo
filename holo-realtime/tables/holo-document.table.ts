import { defineEntity, p, type InferEntity } from '@codenotch/orm';
import { HoloUpdate } from './holo-update.table';

/**
 * Un document Holo édité en temps réel. L'id est dérivé côté client de
 * l'URL du dépôt et du chemin du fichier (UUID v5) : tous les participants
 * d'un même document tombent sur la même ligne sans annuaire préalable.
 */
export const HoloDocument = defineEntity({
    name: 'HoloDocument',
    // Seuls les processus du relais lisent et écrivent ; les applis n'y accèdent pas.
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
        UpdatedAt: p.updatedAt(),
        /** Compte les compactions : une compaction concurrente est refusée. */
        Version: p.version(),
        /** URL web du dépôt git (sans identifiants) */
        Workspace: p.string().maxLength(500),
        /** Chemin du document dans le dépôt, séparateurs « / » */
        Path: p.string().maxLength(1000),
        /** État Yjs compacté (encodeStateAsUpdate, base64) ; null tant qu'aucune compaction */
        State: p.text().nullable(),
        /**
         * Change à chaque réinitialisation de la session (un participant seul repart
         * du fichier git) : un client resté sur une ancienne époque doit rejoindre
         * à neuf, sinon son état Yjs dupliquerait le texte.
         */
        Epoch: p.string().maxLength(64).default(''),
        Updates: () => p.hasMany(HoloUpdate, { belongsTo: 'Document', onDelete: 'cascade' }),
    },
});

export type IHoloDocument = InferEntity<typeof HoloDocument>;
