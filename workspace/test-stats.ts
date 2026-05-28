import * as dbService from '../services/dbService';

async function test() {
  const res = await dbService.getInspectionsList(100, 0, undefined as any);
  const ins = res.items || [];
  console.log("Total:", ins.length);
  const sample = ins.filter((i: any) => i.status !== 'draft').slice(0, 10).map((i: any) => ({
     id: i.id, score: i.score, inspected_qty: i.inspectedQuantity, pass_qty: i.passedQuantity, fail_qty: i.failedQuantity
  }));
  console.log(sample);
}

test().catch(console.error).finally(() => process.exit(0));
