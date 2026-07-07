import { query } from './lib/db';
import { getNcrById } from './services/dbService';

const SCHEMA_NAME = process.env.DB_SCHEMA || 'appQAQC';

(async () => {
    try {
        const res = await query(`SELECT id FROM "${SCHEMA_NAME}".ncrs LIMIT 1`);
        if (res.rows.length > 0) {
            const id = res.rows[0].id;
            console.log('Testing ID:', id);
            console.log(await getNcrById(id));
        } else {
            console.log('No NCRs found.');
        }
    } catch(e) {
        console.error(e);
    }
    process.exit();
})();
