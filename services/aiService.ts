import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import * as api from "./apiService";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const models = ['gemini-2.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview'];

// Define tools for Gemini to interact with our app data
const getRecentInspectionsTool: FunctionDeclaration = {
    name: "getRecentInspections",
    description: "Lấy danh sách các phiếu kiểm tra gần đây nhất bao gồm trạng thái (APPROVED/REJECTED/DRAFT).",
    parameters: {
        type: Type.OBJECT,
        properties: {
            limit: {
                type: Type.NUMBER,
                description: "Số lượng phiếu cần lấy (mặc định 10)"
            }
        }
    }
};

const getProjectInfoTool: FunctionDeclaration = {
    name: "getProjectInfo",
    description: "Lấy thông tin chi tiết về một dự án cụ thể theo mã dự án hoặc tên dự án.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            search: {
                type: Type.STRING,
                description: "Mã dự án hoặc tên dự án (ví dụ: 'P23001' hoặc 'Dự án Landmark')"
            }
        },
        required: ["search"]
    }
};

const getNCRStatsTool: FunctionDeclaration = {
    name: "getNCRStats",
    description: "Lấy thống kê về các lỗi không phù hợp (NCR) hiện có trong hệ thống.",
    parameters: {
        type: Type.OBJECT,
        properties: {}
    }
};

const tools = [
    {
        functionDeclarations: [
            getRecentInspectionsTool,
            getProjectInfoTool,
            getNCRStatsTool
        ]
    }
];

export const generateAIChatResponse = async (userMessage: string, history: any[] = []) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
            return {
                text: "⚠️ **Chưa thiết lập API Key!**\nVui lòng làm theo các bước sau:\n1. Truy cập [Google AI Studio](https://aistudio.google.com/app/apikey) để lấy key.\n2. Mở menu **Settings** trong AI Studio Build và dán key vào biến `GEMINI_API_KEY`.\n3. Hoặc thêm `GEMINI_API_KEY=your_key` vào file `.env`.",
                error: "Missing API Key"
            };
        }

        const chat = ai.chats.create({
            model: models[1], // Using gemini-3.1-flash-lite-preview
            history: history,
            config: {
                systemInstruction: `Bạn là trợ lý AI chuyên gia về hệ thống QMS (Quality Management System) của AA Corporation. 
                Nhiệm vụ của bạn là hỗ trợ nhân viên QC/QA và Quản lý kiểm tra dữ liệu, tình trạng dự án và quy trình ISO.
                
                Hướng dẫn trả lời:
                1. Luôn ưu tiên sử dụng các 'công cụ' (tools) được cung cấp để lấy dữ liệu thực tế trước khi trả lời.
                2. Nếu người dùng hỏi về quy trình ISO chung (như IQC, PQC, FQC), hãy giải thích dựa trên tiêu chuẩn ISO 9001 và quy trình sản xuất nội thất 5 sao.
                3. Trả lời bằng tiếng Việt chuyên nghiệp, ngắn gọn nhưng đầy đủ.
                4. Nếu dữ liệu không tồn tại, hãy thông báo rõ ràng cho người dùng.
                5. Lưu ý bảo mật: Không tiết lộ thông tin nhạy cảm của người dùng khác nếu không được yêu cầu cụ thể liên quan đến công việc.`,
                tools: tools,
                toolConfig: { includeServerSideToolInvocations: true }
            }
        });

        let response = await chat.sendMessage({ message: userMessage });
        
        // Handle function calls manually if the SDK returns them
        let functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const functionResponses = await Promise.all(functionCalls.map(async (call: any) => {
                let callResult;
                try {
                    if (call.name === "getRecentInspections") {
                        const limit = (call.args as any).limit || 10;
                        const data = await api.fetchInspections({}, 1, limit);
                        callResult = data.items || [];
                    } else if (call.name === "getProjectInfo") {
                        const search = (call.args as any).search;
                        const data = await api.fetchProjects(search, 1, 5);
                        callResult = data.items || [];
                    } else if (call.name === "getNCRStats") {
                        const data = await api.fetchNcrs({}, 1, 100);
                        callResult = {
                            total: data.total || 0,
                            open: (data.items || []).filter((n: any) => n.status === 'OPEN').length,
                            closed: (data.items || []).filter((n: any) => n.status === 'CLOSED').length
                        };
                    }
                } catch (error) {
                    callResult = { error: "Không thể lấy dữ liệu ứng dụng." };
                }
                
                return {
                    functionResponse: {
                        name: call.name,
                        response: { result: callResult }
                    }
                };
            }));

            // Send function results back to model
            response = await chat.sendMessage({
                message: functionResponses as any
            });
        }

        return {
            text: response.text || "",
            history: await chat.getHistory()
        };
    } catch (error: any) {
        console.error("AI Chat Error:", error);
        return {
            text: "Xin lỗi, tôi đang gặp sự cố khi kết nối với máy chủ AI. Vui lòng thử lại sau.",
            error: error.message
        };
    }
};
