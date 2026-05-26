const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function(event, context) {
    // 1. The CORS Headers (Crucial for MikroTik Hotspots)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // 2. Handle the Pre-flight browser check
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // 3. Block anything that isn't a POST request
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const userMessage = body.message;

        if (!userMessage) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ success: false, message: "Message cannot be empty." }) 
            };
        }

        // Initialize Gemini using the hidden Environment Variable
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // The AI Personality
        const SYSTEM_INSTRUCTION = `You are the 'Blessmas Smart Assistant', an educational and agricultural AI built for the community of Nzvimbo, Zimbabwe. 
        Your goal is to provide highly accurate, concise, and localized advice.
        1. If asked about education: Focus strictly on ZIMSEC O-Level and A-Level syllabuses (Mathematics, Combined Science, Biology, Chemistry, Physics). Explain concepts step-by-step.
        2. If asked about agriculture: Provide practical advice relevant to Zimbabwean farming seasons, soil types, and common crops (maize, tobacco, groundnuts) or livestock.
        3. Keep all responses relatively short and formatted cleanly, as users are reading this on mobile phones over a Wi-Fi hotspot.
        4. If a prompt is completely unrelated to education or agriculture, politely guide the user back to those topics.`;

        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
                { role: "model", parts: [{ text: "Understood. I am ready to assist the Nzvimbo community." }] }
            ]
        });

        // Send the prompt to Google and wait for the answer
        const result = await chat.sendMessage(userMessage);
        const responseText = result.response.text();
        
        // Return the AI's answer to the user's phone
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, reply: responseText })
        };

    } catch (error) {
        console.error("Gemini API Error:", error);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ success: false, message: "The assistant is currently resting or the network is slow. Please try again." }) 
        };
    }
};