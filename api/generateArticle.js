import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@sanity/client";

// --- Initialize Google Gemini client ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Initialize Sanity client ---
const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: "2025-01-01", // pick a recent date
});

// --- Main API handler ---
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const gameData = req.body;

    if (!gameData) {
      return res.status(400).json({ error: "Missing gameResult data" });
    }

    // --- Craft the prompt for Gemini ---
    const prompt = `
You are a UAAP sports journalist. Generate a news article based on the following game data (no invented facts):

${JSON.stringify(gameData, null, 2)}

Requirements:
1. Catchy headline.
2. First paragraph: summary of final score and winning team.
3. Second paragraph: focus on top performer with stats.
4. Include highlights if any.
5. Final paragraph: what this win means for both teams.
Output JSON:
{
  "headline": "Your headline",
  "body": "Full article text"
}
    `;

    // --- Call Gemini ---
    const model = genAI.getGenerativeModel({ model: "gemini-1" });
    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();

    // --- Parse Gemini JSON output ---
    const articleJSON = JSON.parse(responseText);

    // --- Create the article in Sanity ---
    const newArticle = {
      _type: "article",
      title: articleJSON.headline,
      slug: {
        _type: "slug",
        current: articleJSON.headline.toLowerCase().replace(/\s+/g, "-").slice(0, 90),
      },
      content: [
        {
          _type: "block",
          style: "normal",
          children: [
            {
              _type: "span",
              text: articleJSON.body,
            },
          ],
        },
      ],
      status: "review",
      relatedGame: {
        _type: "reference",
        _ref: gameData._id || "temp-id",
      },
      publishedAt: new Date().toISOString(),
    };

    const createdArticle = await client.create(newArticle);

    return res.status(200).json({ success: true, article: createdArticle });
  } catch (error) {
    console.error("Error generating article:", error);
    return res.status(500).json({ error: error.message });
  }
}
