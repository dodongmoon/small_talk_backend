import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('Error: GEMINI_API_KEY is not set in environment variables.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

const FALLBACK_MODELS = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash-lite-preview-09-2025'
];

const getModel = (modelName) => {
    return genAI.getGenerativeModel({ model: modelName });
};

const generateWithFallback = async (operation) => {
    let lastError;

    for (const modelName of FALLBACK_MODELS) {
        try {
            console.log(`Attempting with model: ${modelName}`);
            const model = getModel(modelName);
            return await operation(model);
        } catch (error) {
            console.warn(`Failed with model ${modelName}:`, error.message);
            lastError = error;

            if (!error.message.includes('429') && !error.message.includes('503') && !error.message.includes('404')) {
                // Optional: break here if we want to fail fast on other errors
            }
        }
    }

    throw lastError || new Error('All fallback models failed');
};

app.post('/api/chat', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const responseText = await generateWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            return result.response.text();
        });

        res.json({ text: responseText });
    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: 'Failed to generate content', details: error.message });
    }
});

app.post('/api/evaluate', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const evaluation = await generateWithFallback(async (model) => {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const jsonStr = text.replace(/```json|```/g, '').trim();
            return JSON.parse(jsonStr);
        });

        res.json(evaluation);
    } catch (error) {
        console.error('Error in /api/evaluate:', error);
        res.status(500).json({ error: 'Failed to evaluate conversation', details: error.message });
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
