import fs from 'fs';
import path from 'path';

const forms = ['components/inspectionformIQC.tsx', 'components/inspectionformSQC_BTP.tsx', 'components/inspectionformSQC_VT.tsx', 'components/inspectionformSITE.tsx'];

for (const p of forms) {
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf-8');

    // First, remove the previously inserted handleEditImage if it's there
    content = content.replace(/  const handleEditImage = \(itemId: string, index: number, images: string\[\]\) => \{\s*setEditorState\(\{ images, index, context: itemId \}\);\s*\};\s*/g, '');
    
    // Add correct handleEditImage for IQC/SQC_BTP/SQC_VT
    if (p.includes('IQC') || p.includes('SQC_BTP') || p.includes('SQC_VT')) {
        if (!content.includes("const handleEditImage = (images: string[], index: number, context: any)")) {
            const insert = `  const handleEditImage = (images: string[], index: number, context: any) => {
      setEditorState({ images, index, context });
  };\n`;
            content = content.replace(/const handleFileUpload =/, insert + '  const handleFileUpload =');
        }
        
        // Fix onImageSave logic for IQC/SQC_BTP/SQC_VT context
        content = content.replace(/  const onImageSave = async \(index: number, newImageUrl: string\) => \{[\s\S]*?  \};\n/g, `  const onImageSave = async (index: number, newImageUrl: string) => {
      if (!editorState) return;
      const newImages = [...editorState.images];
      newImages[index] = newImageUrl;
      setEditorState({ ...editorState, images: newImages });
      const { type, matIdx, itemIdx } = editorState.context || {};
      
      if (type === 'MAIN') {
          setFormData(prev => ({ ...prev, images: newImages }));
      } else if (type === 'DELIVERY') {
          setFormData(prev => ({ ...prev, deliveryNoteImages: newImages }));
      } else if (type === 'REPORT') {
          setFormData(prev => ({ ...prev, reportImages: newImages }));
      } else if (type === 'MATERIAL' && matIdx !== undefined) {
          setFormData(prev => {
              const next = { ...prev };
              if (next.materials && next.materials[matIdx]) {
                  next.materials[matIdx].images = newImages;
              }
              return next;
          });
      } else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
          setFormData(prev => {
              const next = { ...prev };
              if (next.materials && next.materials[matIdx] && next.materials[matIdx].items && next.materials[matIdx].items[itemIdx]) {
                  next.materials[matIdx].items[itemIdx].images = newImages;
              }
              return next;
          });
      }
  };\n`);
    } else if (p.includes('SITE')) {
        if (!content.includes('const handleEditImage = (itemId: string, index: number, images: string[])')) {
            const insert = `  const handleEditImage = (itemId: string, index: number, images: string[]) => {
      setEditorState({ images, index, context: itemId });
  };\n`;
            content = content.replace(/const handleItemChange =/, insert + '  const handleItemChange =');
        }
    }

    fs.writeFileSync(p, content);
}
console.log("Lint2 fixed");
