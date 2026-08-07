const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
    "await db.saveInspection(childPayload, userName);\\n          }",
    "await db.saveInspection(childPayload, userName);\\n          }\\n          try { await db.deleteInspection(payload.id); } catch (e) {}"
);
fs.writeFileSync('server.ts', code);
