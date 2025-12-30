import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { generate3DFrom2D, GenerationMode } from '../services/geminiService';
import { Upload, Box, RefreshCw, Download, Image as ImageIcon, Loader2, Layers, Rotate3D, Cuboid, FileText } from 'lucide-react';

export const ThreeDConverter: React.FC = () => {
  const [inputData, setInputData] = useState<string | null>(null); // Base64 Data URL
  const [fileType, setFileType] = useState<string>(''); // MIME type
  const [fileName, setFileName] = useState<string>(''); // File name for display
  
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<GenerationMode>('STANDARD');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 360 Rotation State
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startFrame, setStartFrame] = useState(0);
  const TOTAL_FRAMES = 8;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (Max 40MB to be safe for Gemini inline data limit ~50MB)
    const MAX_SIZE = 40 * 1024 * 1024; 
    if (file.size > MAX_SIZE) {
        alert("File quá lớn. Vui lòng chọn file nhỏ hơn 40MB.");
        return;
    }

    setFileName(file.name);
    setFileType(file.type);

    const reader = new FileReader();
    reader.onloadend = () => {
      setInputData(reader.result as string);
      setOutputImage(null); // Reset output when new input added
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!inputData) return;

    setIsLoading(true);
    try {
      const result = await generate3DFrom2D(inputData, description, mode);
      if (result) {
        // Preload image to ensure smooth playback before displaying
        const img = new Image();
        img.src = result;
        img.onload = () => {
            setOutputImage(result);
            setCurrentFrame(0); // Reset rotation
        };
      } else {
        alert("Không thể tạo hình ảnh 3D. Vui lòng thử lại hoặc kiểm tra API Key.");
      }
    } catch (error) {
      console.error("Error generating 3D:", error);
      alert("Đã xảy ra lỗi trong quá trình xử lý.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!outputImage) return;
    const link = document.createElement('a');
    link.href = outputImage;
    link.download = `aatn-3d-${mode.toLowerCase()}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 360 Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'ROTATION' || !outputImage) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setStartX(clientX);
    setStartFrame(currentFrame);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || mode !== 'ROTATION' || !outputImage) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diff = clientX - startX;
    
    // Sensitivity: Higher number = slower rotation (more pixels needed to change frame)
    // 10-15 pixels per frame is a good balance for smoothness
    const sensitivity = 15; 
    
    // Calculate new frame index
    let newFrame = Math.floor(startFrame - diff / sensitivity);
    
    // Normalize to 0 -> TOTAL_FRAMES - 1
    newFrame = ((newFrame % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
    
    setCurrentFrame(newFrame);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="h-full flex flex-col animate-fade-in pb-20 md:pb-0 bg-slate-50">
      {/* Header */}
      <div className="bg-white p-4 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white shadow-lg">
            <Box className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Chuyển đổi 2D sang 3D</h2>
            <p className="text-xs text-slate-500">AI Rendering & Phân tách chi tiết (Hỗ trợ Ảnh & PDF)</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
          
          {/* Left Column: Input & Controls */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col h-full">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center">
                <Upload className="w-4 h-4 mr-2" /> 1. Tải lên Bản vẽ 2D
              </h3>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 min-h-[200px] max-h-[400px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden bg-slate-50 hover:bg-slate-100 ${inputData ? 'border-blue-300' : 'border-slate-300 hover:border-blue-400'}`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*,application/pdf" 
                  className="hidden" 
                />
                
                {inputData ? (
                  <div className="w-full h-full flex flex-col items-center justify-center relative p-4">
                    {fileType === 'application/pdf' ? (
                         <div className="flex flex-col items-center justify-center text-red-500">
                             <FileText className="w-20 h-20 mb-4 drop-shadow-sm" />
                             <p className="text-slate-700 font-bold text-lg text-center break-all px-4">{fileName}</p>
                             <p className="text-slate-400 text-sm mt-1 uppercase">PDF Document</p>
                         </div>
                    ) : (
                        <img src={inputData} alt="Input" className="w-full h-full object-contain p-2" />
                    )}
                    
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-white font-medium flex items-center"><RefreshCw className="w-5 h-5 mr-2"/> Thay đổi file</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <p className="font-medium text-slate-700">Tải lên bản vẽ kỹ thuật</p>
                    <p className="text-sm text-slate-400 mt-1">Hỗ trợ JPG, PNG, PDF (Max 40MB)</p>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-2 block">2. Chọn Chế độ tạo</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button 
                            onClick={() => setMode('STANDARD')}
                            className={`p-3 rounded-lg border text-xs sm:text-sm font-medium flex flex-col items-center justify-center gap-2 transition-all ${mode === 'STANDARD' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                        >
                            <Cuboid className="w-5 h-5"/>
                            <span>Mặc định</span>
                        </button>
                        <button 
                            onClick={() => setMode('ROTATION')}
                            className={`p-3 rounded-lg border text-xs sm:text-sm font-medium flex flex-col items-center justify-center gap-2 transition-all ${mode === 'ROTATION' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                        >
                            <Rotate3D className="w-5 h-5"/>
                            <span>Xoay 360°</span>
                        </button>
                        <button 
                            onClick={() => setMode('EXPLODED')}
                            className={`p-3 rounded-lg border text-xs sm:text-sm font-medium flex flex-col items-center justify-center gap-2 transition-all ${mode === 'EXPLODED' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                        >
                            <Layers className="w-5 h-5"/>
                            <span>Phân tách</span>
                        </button>
                    </div>
                </div>

                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Mô tả chi tiết (Optional)</label>
                   <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ví dụ: Ghế gỗ sồi, nệm vải màu xám, chân kim loại đen..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 bg-slate-50"
                   />
                </div>
                
                <Button 
                  onClick={handleGenerate} 
                  disabled={!inputData || isLoading}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Đang xử lý {mode === 'ROTATION' ? '(tạo Sprite sheet)' : ''}...
                    </>
                  ) : (
                    <>
                      <Box className="w-5 h-5 mr-2" />
                      Tạo hình ảnh 3D
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col h-full relative">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-700 flex items-center">
                    <Box className="w-4 h-4 mr-2" /> Kết quả 3D
                  </h3>
                  {mode === 'ROTATION' && outputImage && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">
                          Kéo để xoay
                      </span>
                  )}
                  {mode === 'EXPLODED' && outputImage && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold">
                          Exploded View
                      </span>
                  )}
              </div>
              
              <div 
                className={`flex-1 min-h-[300px] bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden relative border border-slate-800 select-none ${mode === 'ROTATION' && outputImage ? 'cursor-grab active:cursor-grabbing' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
              >
                {isLoading ? (
                  <div className="text-center">
                    <div className="relative w-20 h-20 mx-auto mb-4">
                        <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <Box className="absolute inset-0 m-auto text-white w-8 h-8 animate-pulse" />
                    </div>
                    <p className="text-slate-300 animate-pulse">AI đang dựng hình...</p>
                    <p className="text-xs text-slate-500 mt-2">Đang chuyển đổi bản vẽ sang {mode.toLowerCase()}</p>
                  </div>
                ) : outputImage ? (
                    mode === 'ROTATION' ? (
                        // 360 Viewer (Sprite Sheet Logic)
                        <div 
                            style={{
                                width: '100%',
                                height: '100%',
                                backgroundImage: `url(${outputImage})`,
                                // 8 frames horizontal sprite sheet
                                backgroundPosition: `${(currentFrame * 100) / (TOTAL_FRAMES - 1)}% 0`,
                                backgroundSize: `${TOTAL_FRAMES * 100}% 100%`,
                                backgroundRepeat: 'no-repeat',
                                objectFit: 'contain'
                            }}
                            className="w-full h-full"
                        />
                    ) : (
                        // Standard & Exploded View
                        <img src={outputImage} alt="3D Output" className="w-full h-full object-contain pointer-events-none" />
                    )
                ) : (
                  <div className="text-center text-slate-500 p-8 opacity-50">
                    <Box className="w-16 h-16 mx-auto mb-3" />
                    <p>Kết quả sẽ hiển thị tại đây</p>
                  </div>
                )}
              </div>

              {outputImage && (
                <div className="mt-4 flex justify-between items-center">
                   <div className="text-xs text-slate-500 italic">
                      {mode === 'ROTATION' ? 'Di chuột/ngón tay ngang màn hình để xoay.' : 'Hình ảnh độ phân giải cao.'}
                   </div>
                   <Button onClick={handleDownload} variant="secondary" icon={<Download className="w-4 h-4" />}>
                     Tải xuống
                   </Button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};