import { query } from './lib/db';
import { getNcrs } from './services/dbService';
(async () => {
    try {
        console.log(await getNcrs({ search: 'CT25' }, 1, 10));
    } catch(e) {
        console.error(e);
    }
    process.exit();
})();
