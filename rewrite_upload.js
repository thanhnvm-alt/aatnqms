import fs from 'fs';
import path from 'path';

const forms = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const form of forms) {
    const p = path.join('components', form);
    let content = fs.readFileSync(p, 'utf-8');

    // 1. Rewrite handleFileUpload
    const uploadRegex = /const handleFileUpload = async \(\s*e\s*:\s*React\.ChangeEvent<HTMLInputElement>\s*\) => \{[\s\S]*?(?=const handleEditImage)/;
    if (uploadRegex.test(content)) {
        content = content.replace(uploadRegex, `const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadId) return;
    setIsProcessingImages(true);
    try {
        const uploadedUrls = await Promise.all(
            Array.from(files).map(async (file: File) => {
                return await uploadQMSImage(file, { 
                    entityId: formData.id || 'new', 
                    type: 'INSPECTION', 
                    role: activeUploadId === 'MAIN' ? 'MAIN' : 'ITEM' 
                });
            })
        );
        
        if (activeUploadId === 'MAIN') {
            setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...uploadedUrls] }));
        } else {
            setFormData(prev => ({ 
                ...prev, 
                items: prev.items?.map(i => 
                    i.id === activeUploadId 
                        ? { ...i, images: [...(i.images || []), ...uploadedUrls] } 
                        : i
                ) 
            }));
        }
    } catch (err) { 
        console.error("ISO-UPLOAD: Failed", err); 
        alert("Lỗi tải ảnh lên.");
    } finally { 
        setIsProcessingImages(false); 
        e.target.value = ''; 
    }
  };

  `);
    }

    // 2. Rewrite onImageSave
    const onImageSaveRegex = /const onImageSave = async \(\s*idx\s*:\s*number,\s*updatedImg\s*:\s*string\s*\) => \{[\s\S]*?(?=return \()/;
    if (onImageSaveRegex.test(content)) {
        content = content.replace(onImageSaveRegex, `const onImageSave = async (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, itemId } = editorState.context;
      setIsProcessingImages(true);
      try {
          // Convert base64 to File
          const res = await fetch(updatedImg);
          const blob = await res.blob();
          const file = new File([blob], \`edited_\${Date.now()}.jpg\`, { type: 'image/jpeg' });
          
          // Upload immediately
          const uploadedUrl = await uploadQMSImage(file, { 
              entityId: formData.id || 'new', 
              type: 'INSPECTION', 
              role: type === 'MAIN' ? 'MAIN' : 'ITEM' 
          });

          if (type === 'MAIN') { 
              setFormData(prev => { 
                  const newImgs = [...(prev.images || [])]; 
                  newImgs[idx] = uploadedUrl; 
                  return { ...prev, images: newImgs }; 
              }); 
          }
          else if (type === 'ITEM' && itemId) { 
              setFormData(prev => ({ 
                  ...prev, 
                  items: prev.items?.map(i => i.id === itemId 
                      ? { ...i, images: i.images?.map((img, imIdx) => imIdx === idx ? uploadedUrl : img) } 
                      : i) 
              })); 
          }
      } catch (err) { 
          alert("Lỗi lưu ảnh chỉnh sửa."); 
      } finally { 
          setIsProcessingImages(false); 
      }
  };

  `);
    }

    // Optional: Also remove compressImage from imports if it's there
    content = content.replace(/, compressImage/g, '');
    content = content.replace(/import \{ compressImage \} from '\.\.\/services\/imageService';\n/g, '');

    fs.writeFileSync(p, content);
    console.log(`Rewrote ${form}`);
}
