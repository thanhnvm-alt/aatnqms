
export const generateAIChatResponse = async (userMessage: string, history: any[] = []) => {
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aatn_qms_token') || ''}`
            },
            body: JSON.stringify({ message: userMessage, history })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Lỗi kết nối server AI');
        }

        return await response.json();
    } catch (error: any) {
        console.error("AI Chat Full Error:", error);
        return {
            text: `❌ **Lỗi Corporate Server**: ${error.message}\n\n*Hành động: Hãy báo bộ phận IT kiểm tra biến GEMINI_API_KEY trên server.*`,
            error: error.message
        };
    }
};
