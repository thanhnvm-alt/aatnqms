const fs = require('fs');
let code = fs.readFileSync('components/inspectionformSQC_TP.tsx', 'utf8');

const hookStr = `  const clearDraft = () => {
    PersistenceService.clearDraft('SQC_TP', user.id);
    setHasDraft(false);
  };`;

const newHookStr = `  const clearDraft = () => {
    PersistenceService.clearDraft('SQC_TP', user.id);
    setHasDraft(false);
  };

  const availableCategories = useMemo(() => {
      const btpTpl = templates['SQC_TP'] || [];
      return Array.from(new Set(btpTpl.map(i => i.stage))).filter(Boolean).sort() as string[];
  }, [templates]);`;

code = code.replace(hookStr, newHookStr);
fs.writeFileSync('components/inspectionformSQC_TP.tsx', code);
