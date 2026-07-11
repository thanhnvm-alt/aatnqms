import fs from 'fs';
let content = fs.readFileSync('components/LayoutManager.tsx', 'utf-8');

const target = `<div className="flex gap-2">
                                    <input 
                                        value={newComment} 
                                        onChange={e => setNewComment(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && handlePostQuickComment()} 
                                        className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-[12px] font-medium outline-none focus:ring-4 focus:ring-blue-100 h-12 transition-all shadow-inner" 
                                        placeholder="Phản hồi nhanh..." 
                                    />
                                    <button 
                                        onClick={handlePostQuickComment} 
                                        disabled={isUpdating || !newComment.trim()} 
                                        className="w-12 h-12 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-30 hover:bg-blue-600 hover:text-white"
                                    >
                                        <Send className="w-5 h-5"/>
                                    </button>
                                </div>`;

const replacement = `<div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <input 
                                            value={newComment} 
                                            onChange={e => setNewComment(e.target.value)} 
                                            onKeyDown={e => e.key === 'Enter' && handlePostQuickComment()} 
                                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-[70px] py-3 text-[12px] font-medium outline-none focus:ring-4 focus:ring-blue-100 h-12 transition-all shadow-inner" 
                                            placeholder="Phản hồi nhanh..." 
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                            <button onClick={() => quickCameraRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" title="Chụp ảnh">
                                                <Camera className="w-4 h-4"/>
                                            </button>
                                            <button onClick={() => quickFileRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" title="Chọn ảnh">
                                                <ImageIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handlePostQuickComment} 
                                        disabled={isUpdating || !newComment.trim()} 
                                        className="w-12 h-12 shrink-0 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-30 hover:bg-blue-600 hover:text-white"
                                    >
                                        <Send className="w-5 h-5"/>
                                    </button>
                                </div>`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('components/LayoutManager.tsx', content);
    console.log("Successfully replaced chat input");
} else {
    console.error("Target not found");
}
