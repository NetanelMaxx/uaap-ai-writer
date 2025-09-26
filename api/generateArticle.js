import { GoogleGenerativeAI } from "@google/generative-ai";
import sanityClient from "@sanity/client";

// 1. Setup Google Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. Setup Sanity client
const client = sanityClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: "2025-01-01", // pick a recent date
});

// 3. API Route (ESM style export)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { gameResult } = req.body;

    if (!gameResult) {
      return res.status(400).json({ error: "Missing gameResult data" });
    }

    // Generate article text from Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `
      Write a sports news article about this UAAP Basketball game result:
      ${JSON.stringify(gameResult, null, 2)}
    `;

    const result = await model.generateContent(prompt);
    const articleText = result.response.text();

    // Save into Sanity as "article"
    const article = await client.create({
      _type: "article",
      title: `Game Recap: ${gameResult.teamA} vs ${gameResult.teamB}`,
      content: articleText,
      relatedGame: {
        _type: "reference",
        _ref: gameResult._id,
      },
      publishedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, article });
  } catch (error) {
    console.error("Error generating article:", error);
    return res.status(500).json({ error: "Failed to generate article" });
  }
}
