import { getNcrById } from './services/dbService';
(async () => {
    try {
        console.log(await getNcrById('123'));
    } catch(e) {
        console.error(e);
    }
    process.exit();
})();
