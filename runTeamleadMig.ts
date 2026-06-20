import 'dotenv/config';
import { checkAndCreateTeamLeadColumns } from './services/migrationTeamLead';

async function run() {
  await checkAndCreateTeamLeadColumns();
  console.log("Done adding teamlead columns!");
  process.exit(0);
}
run();
