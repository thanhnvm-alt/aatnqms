import { getNcrById } from './services/dbService.js';
(async () => {
    try {
        console.log(await getNcrById('123')); // Just to see if SQL crashes
    } catch(e) {
        console.error(e);
    }
    process.exit();
})();
