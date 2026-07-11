import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');
content = content.replace(
    "import { fetchInspectionsProjects } from '../services/apiService';",
    "import { fetchInspectionsProjects, fetchNcrs } from '../services/apiService';"
);
content = content.replace(
    "import { Inspection, InspectionStatus, Priority, User, ViewState, Workshop } from '../types';",
    "import { Inspection, InspectionStatus, Priority, User, ViewState, Workshop, NCR } from '../types';"
);
fs.writeFileSync('components/Dashboard.tsx', content);
