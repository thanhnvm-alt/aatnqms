import { getDashboardStats } from './services/dbService';
(async () => {
    try {
        console.log(await getDashboardStats({}));
    } catch(e) {
        console.error(e);
    }
    process.exit();
})();
