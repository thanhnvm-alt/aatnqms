const fs = require('fs');
let code = fs.readFileSync('components/inspectionformSQC_TP.tsx', 'utf8');

code = code.replace(
    "<button onClick={handleAddMaterial} className=\"bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3\" type=\"button\">",
    "{(!initialData?.id || initialData.id.split('-').length <= 3) && <button onClick={handleAddMaterial} className=\"bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3\" type=\"button\">"
);

code = code.replace(
    "<span className=\"text-[10px] font-bold uppercase\">Thêm Thành Phẩm</span>\n                    </button>",
    "<span className=\"text-[10px] font-bold uppercase\">Thêm Thành Phẩm</span>\n                    </button>}"
);

fs.writeFileSync('components/inspectionformSQC_TP.tsx', code);
