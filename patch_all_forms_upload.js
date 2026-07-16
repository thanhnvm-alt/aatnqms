import fs from 'fs';
import path from 'path';

const forms = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const form of forms) {
    const p = path.join('components', form);
    let content = fs.readFileSync(p, 'utf-8');
    let original = content;

    // 1. Rewrite handleFileUpload
    const uploadRegex = /const handleFileUpload = async \(\s*e\s*:\s*React\.ChangeEvent<HTMLInputElement>\s*\) => \{[\s\S]*?(?=const handleDeleteImage|const handleDeleteMainImage|const handleSaveDraft|const handleSubmit)/;
    
    if (uploadRegex.test(content)) {
        const replacement = `const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  `;
        content = content.replace(uploadRegex, replacement);
    }
    
    // Some forms might use `uploadImage` instead of `handleFileUpload`? Let's also check for handleMainImageUpload if they split it.
    // PQC uses `handleFileUpload` and `activeUploadId`.

    // 2. Rewrite handleSubmit to REMOVE the `tasks` and `Promise.all(tasks)` block.
    // The structure is usually:
    // const tasks: UploadTask[] = [];
    // ... adding to tasks ...
    // if (totalTasks > 0) { ... await Promise.all(tasks.map(...)) ... }
    // setFormData(finalForm => { ... onSave(...) ... return finalForm })
    //
    // Since we just want to remove the task logic, we can replace the entire block from `const tasks: UploadTask[]` to `setFormData(finalForm =>` with just `setFormData(finalForm =>`.

    const tasksBlockRegex = /\s*\/\/\s*Helper to prepare upload tasks[\s\S]*?\/\/\s*Final snapshot for saving/g;
    if (tasksBlockRegex.test(content)) {
        content = content.replace(tasksBlockRegex, `\n        // Final snapshot for saving`);
    }

    // Wait, earlier the user also wants to fix NCRModal's handleImageUpload
    const ncrImageUploadRegex = /const handleImageUpload = async \(\s*e\s*:\s*React\.ChangeEvent<HTMLInputElement>\s*\) => \{[\s\S]*?(?=const handleDeleteImage)/;
    if (ncrImageUploadRegex.test(content)) {
        const replacement = `const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setIsAiLoading(true);
        try {
            const uploadedUrls = await Promise.all(
                Array.from(files).map(async (file: File) => {
                    return await uploadQMSImage(file, { entityId: ncrData.id || 'new', type: 'NCR', role: uploadTarget });
                })
            );
            
            setNcrData(prev => {
                const field = uploadTarget === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
                return { ...prev, [field]: [...(prev[field] as string[] || []), ...uploadedUrls] };
            });
        } catch (err) {
            alert("Lỗi tải ảnh lên.");
        } finally {
            setIsAiLoading(false);
            e.target.value = '';
        }
    };

    `;
        content = content.replace(ncrImageUploadRegex, replacement);
    }

    // Remove `compressImage` imports and usages if any remaining
    content = content.replace(/import\s+\{\s*compressImage\s*\}\s*from\s*'[^']+\/imageService';\n/g, '');
    
    // Let's also check ImageEditorModal onSave
    const editorOnSaveRegex = /onSave=\{async \(\s*updatedImg\s*\) => \{[\s\S]*?const finalImg = updatedImg\.startsWith\('data:'\) \? await compressImage\(updatedImg\) : updatedImg;[\s\S]*?const res = await fetch\(finalImg\);/g;
    
    if (editorOnSaveRegex.test(content)) {
        content = content.replace(
            editorOnSaveRegex,
            `onSave={async (updatedImg) => {
                const { type, itemId } = editorState.context;
                setIsProcessingImages(true);
                try {
                    const res = await fetch(updatedImg);`
        );
    }

    if (content !== original) {
        fs.writeFileSync(p, content);
        console.log(`Updated ${form}`);
    }
}
