import fs from 'fs';
import path from 'path';

const insertAfter = (content, search, insert) => {
    if (content.includes(insert.trim().split('\n')[0])) return content;
    const index = content.indexOf(search);
    if (index === -1) return content;
    return content.slice(0, index + search.length) + '\n' + insert + content.slice(index + search.length);
};

const forms = ['components/inspectionformIQC.tsx', 'components/inspectionformSITE.tsx', 'components/inspectionformSQC_BTP.tsx', 'components/inspectionformSQC_VT.tsx'];

for (const p of forms) {
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf-8');

    if (p.includes('SQC_VT')) {
        content = insertAfter(content, "const [newDocName, setNewDocName] = useState('');", `
  const toggleDoc = (id: string) => {
      setFormData(prev => ({ ...prev, supportingDocs: prev.supportingDocs?.map(d => d.id === id ? { ...d, verified: !d.verified } : d) }));
  };

  const addCustomDoc = () => {
      if (!newDocName.trim()) return;
      setFormData(prev => ({ ...prev, supportingDocs: [...(prev.supportingDocs || []), { id: \`doc_\${Date.now()}\`, name: newDocName.trim(), verified: true }] }));
      setNewDocName('');
  };`);
    }

    if (!content.includes('const [activeUploadId, setActiveUploadId] = useState<string | null>(null);')) {
        content = insertAfter(content, "const [editorState, setEditorState]", "  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);");
    }

    if (!content.includes('const onImageSave')) {
        content = insertAfter(content, "const handleFileUpload =", `  const onImageSave = async (index: number, newImageUrl: string) => {
      if (!editorState) return;
      const newImages = [...editorState.images];
      newImages[index] = newImageUrl;
      setEditorState({ ...editorState, images: newImages });
      if (editorState.context === 'MAIN' || editorState.context === 'SITE') {
          setFormData(prev => ({ ...prev, images: newImages }));
      } else {
          setFormData(prev => ({
              ...prev,
              items: prev.items?.map(it => it.id === editorState.context ? { ...it, images: newImages } : it)
          }));
      }
  };`);
    }

    if (!content.includes('const handleEditImage =')) {
        content = insertAfter(content, "const handleItemChange =", `  const handleEditImage = (itemId: string, index: number, images: string[]) => {
      setEditorState({ images, index, context: itemId });
  };`);
    }

    fs.writeFileSync(p, content);
}
console.log("Lint fixed");
