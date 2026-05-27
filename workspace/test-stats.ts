import { db } from './services/dbService';

async function test() {
  const ins = await db.getAllInspections({}, 'QC', 'All');
  console.log("Total:", ins.length);
  const sample = ins.filter(i => i.status !== 'DRAFT').slice(0, 10).map(i => ({
     id: i.id, score: i.score, inspected_qty: i.inspectedQuantity, pass_qty: i.passedQuantity, fail_qty: i.failedQuantity
  }));
  console.log(sample);
}

test().catch(console.error).finally(() => process.exit(0));
