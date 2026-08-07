const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldStr = `              await db.saveInspection(childPayload, userName);
          }
          try { await db.deleteInspection(payload.id); } catch(e){}
          }
      } else {`;

const newStr = `              await db.saveInspection(childPayload, userName);
          }
          try { await db.deleteInspection(payload.id); } catch(e){}
      } else {`;

code = code.replace(oldStr, newStr);
fs.writeFileSync('server.ts', code);
