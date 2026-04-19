import { GoogleGenAI } from "@google/genai";
import { Transaction } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getFinancialInsights(transactions: Transaction[], currentBudget: number) {
  const model = "gemini-3-flash-preview";
  
  const transactionsSummary = transactions.map(t => ({
    date: t.date,
    amount: t.amount,
    type: t.type,
    category: t.category,
    description: t.description
  }));

  const prompt = `
    As a professional financial advisor, analyze the following user transactions and provide 3-4 concise, actionable insights and saving tips.
    
    Current Monthly Budget: $${currentBudget}
    Transactions: ${JSON.stringify(transactionsSummary)}
    
    Format the response in Markdown.
    Focus on:
    1. Spending patterns (e.g., "You spend most on X category").
    2. Comparison to budget if possible.
    3. Actionable advice to save more.
    4. Encouragement.
    
    Keep it professional but friendly. Use bullet points.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text || "I'm having trouble analyzing your data right now. Try adding more transactions!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to generate insights. Please check your data or try again later.";
  }
}
