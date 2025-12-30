
import { GoogleGenAI, Type } from "@google/genai";
import { Inspection, CheckStatus, CheckItem } from "../types";

// Fixed: Added GenerationMode type definition for 3D generation modes
export type GenerationMode = 'STANDARD' | 'ROTATION' | 'EXPLODED';

// Fixed: Added getApiKey export to resolve import error in App.tsx
export const getApiKey = () => process.env.API_KEY;

/**
 * Phân tích toàn bộ báo cáo kiểm tra
 */
export const generateInspectionAnalysis = async (inspection: Inspection): Promise<{ summary: string; suggestions: string }> => {
  const failedItems = inspection.items.filter(i => i.status === CheckStatus.FAIL);
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Phân tích báo cáo kiểm tra:
- Dự án: ${inspection.ma_ct}
- Sản phẩm: ${inspection.ten_hang_muc}
- Điểm: ${inspection.score}/100
- Danh sách lỗi: ${failedItems.map(item => `${item.category}: ${item.label} (${item.notes})`).join('; ')}`,
      config: {
        systemInstruction: "Bạn là chuyên gia QA/QC nội thất cao cấp. Hãy trả về tóm tắt tình trạng và đề xuất hành động khắc phục tổng thể dưới dạng JSON.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            suggestions: { type: Type.STRING },
          },
          required: ["summary", "suggestions"],
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI không trả về nội dung.");

    const result = JSON.parse(text);
    return {
      summary: result.summary || "Không có tóm tắt.",
      suggestions: result.suggestions || "Không có đề xuất."
    };
  } catch (error: any) {
    console.error("Gemini analysis failed:", error);
    return {
      summary: "Lỗi kết nối AI.",
      suggestions: "Vui lòng kiểm tra lại cấu hình API Key trong Vercel/System Environment."
    };
  }
};

/**
 * Tạo gợi ý khắc phục nhanh cho một hạng mục lỗi cụ thể
 */
export const generateItemSuggestion = async (item: CheckItem, context?: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Hạng mục: ${item.label}
Danh mục: ${item.category}
Trạng thái: ${item.status}
Ghi chú hiện tại: ${item.notes || 'Trống'}
Bối cảnh dự án: ${context || 'Nội thất AA'}`,
      config: {
        systemInstruction: "Bạn là QC trưởng tại xưởng mộc/sơn. Hãy đưa ra 1 câu hướng dẫn khắc phục kỹ thuật ngắn gọn (dưới 20 từ) cho lỗi này. Không thêm lời chào.",
      }
    });

    return response.text?.trim() || "Cần kiểm tra và sửa chữa kỹ thuật.";
  } catch (error) {
    console.error("Item suggestion failed:", error);
    return "Lỗi gợi ý AI (Kết nối).";
  }
};

// Fixed: Changed mode type from string to GenerationMode to match component usage
export const generate3DFrom2D = async (fileDataUrl: string, description: string, mode: GenerationMode = 'STANDARD'): Promise<string | null> => {
    const match = fileDataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1];
    const data = match[2];

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image', 
            contents: {
                parts: [
                    { inlineData: { mimeType, data } },
                    { text: `Create a high-quality 3D ${mode.toLowerCase()} perspective rendering of this technical drawing. Description: ${description}` }
                ]
            }
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (error) {
        console.error("3D Generation failed:", error);
        return null;
    }
};
