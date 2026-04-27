import { getInspectionsList } from './services/dbService';

async function run() {
  try {
    const res = await getInspectionsList({}, 1, 5);
    console.log(res.items.map(i => ({ id: i.id, ma_ct: i.ma_ct, updated_at: i.updatedAt, status: i.status })));
  } catch (e) {
    console.error(e);
  }
}
run();
