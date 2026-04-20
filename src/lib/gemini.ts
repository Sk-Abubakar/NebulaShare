import { GoogleGenerativeAI } from "@google/generative-ai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function askGeminiWithContext(
  messages: ChatMessage[],
  prompt: string,
): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY");

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" });

  const contextLines = messages
    .slice(-10)
    .map((m) => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
    .join("\n");

  const finalPrompt = [
    "You are NebulaShare AI Assistant.",
    "Give concise, practical responses for chat and file-sharing users.",
    "Recent chat context:",
    contextLines || "(empty)",
    "",
    `Latest user request: ${prompt}`,
  ].join("\n");

  const result = await model.generateContent(finalPrompt);
  const text = result.response.text().trim();
  return text || "I could not generate a response right now.";
}
