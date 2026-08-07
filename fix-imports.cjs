const fs = require('fs');

let code = fs.readFileSync('components/InspectionList.tsx', 'utf8');
code = code.replace("PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,", "PackageCheck, Package, Factory, Truck, Box, ShieldCheck, MapPin,");
fs.writeFileSync('components/InspectionList.tsx', code);
