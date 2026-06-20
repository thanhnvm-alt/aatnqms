import { query } from '../lib/db.js';
import { MODULE_TABLES } from './dbService';

export async function checkAndCreateTeamLeadColumns() {
    const SCHEMA_NAME = (typeof process !== 'undefined' && process.env.DB_SCHEMA) || 'appQAQC';
    const SCHEMA = `"${SCHEMA_NAME}"`;
    for (const table of MODULE_TABLES) {
        const fullTable = table === 'site' ? 'forms_site' : `forms_${table}`;
        try {
            await query(`ALTER TABLE ${SCHEMA}."${fullTable}" ADD COLUMN IF NOT EXISTS signature_teamlead TEXT`);
            await query(`ALTER TABLE ${SCHEMA}."${fullTable}" ADD COLUMN IF NOT EXISTS name_teamlead TEXT`);
            await query(`ALTER TABLE ${SCHEMA}."${fullTable}" ADD COLUMN IF NOT EXISTS date_teamlead TEXT`);
        } catch (e) {
            console.error(`Error adding columns to ${fullTable}:`, e);
        }
    }
}
