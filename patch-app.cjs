const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  "SQC_BTP_CHECKLIST_TEMPLATE,",
  "SQC_BTP_CHECKLIST_TEMPLATE,\n  SQC_TP_CHECKLIST_TEMPLATE,"
);

code = code.replace(
  "const InspectionFormSQC_BTP = lazy(() => import('./components/inspectionformSQC_BTP').then(m => ({ default: m.InspectionFormSQC_BTP })));",
  "const InspectionFormSQC_BTP = lazy(() => import('./components/inspectionformSQC_BTP').then(m => ({ default: m.InspectionFormSQC_BTP })));\nconst InspectionFormSQC_TP = lazy(() => import('./components/inspectionformSQC_TP').then(m => ({ default: m.InspectionFormSQC_TP })));"
);

code = code.replace(
  "const InspectionDetailSQC_BTP = lazy(() => import('./components/inspectiondetailSQC_BTP').then(m => ({ default: m.InspectionDetailSQC_BTP })));",
  "const InspectionDetailSQC_BTP = lazy(() => import('./components/inspectiondetailSQC_BTP').then(m => ({ default: m.InspectionDetailSQC_BTP })));\nconst InspectionDetailSQC_TP = lazy(() => import('./components/inspectiondetailSQC_TP').then(m => ({ default: m.InspectionDetailSQC_TP })));"
);

code = code.replace(
  "'SQC_BTP': InspectionDetailSQC_BTP,",
  "'SQC_BTP': InspectionDetailSQC_BTP, 'SQC_TP': InspectionDetailSQC_TP,"
);

code = code.replace(
  "'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE,",
  "'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE, 'SQC_TP': SQC_TP_CHECKLIST_TEMPLATE,"
);

code = code.replace(
  "activeInspection?.type === 'SQC_BTP' || initialFormState?.type === 'SQC_BTP' ? <InspectionFormSQC_BTP initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> :",
  "activeInspection?.type === 'SQC_BTP' || initialFormState?.type === 'SQC_BTP' ? <InspectionFormSQC_BTP initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> :\n                    activeInspection?.type === 'SQC_TP' || initialFormState?.type === 'SQC_TP' ? <InspectionFormSQC_TP initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> :"
);

fs.writeFileSync('App.tsx', code);
