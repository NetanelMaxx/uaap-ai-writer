// api/generateArticle.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@sanity/client";

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN; // Must have write access

// Initialize clients
const genAI = new GoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  token: SANITY_API_TOKEN,
  useCdn: false, // false because we write data
});

// --- MAIN FUNCTION ---
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const gameData = req.body;
    console.log("Received game data:", gameData);

    // --- CRAFT PROMPT ---
    const prompt = `
You are an expert UAAP sports journalist. Generate a compelling article based only on the data below. Do not invent facts.

**Game Info:**
- Winning Team: ${gameData.winningTeam}
- Winning Score: ${gameData.winningScore}
- Losing Team: ${gameData.losingTeam}
- Losing Score: ${gameData.losingScore}

**Top Player:**
- Name: ${gameData.topPerformer.name}
- Stats: ${gameData.topPerformer.points} points, ${gameData.topPerformer.rebounds} rebounds, ${gameData.topPerformer.assists} assists

**Highlights:**
${gameData.highlights ? `- ${gameData.highlights.join("\n- ")}` : "No specific highlights provided."}

**Requirements:**
1. Catchy headline.
2. First paragraph: game outcome & final score.
3. Second paragraph: top player performance.
4. Third paragraph: key highlights (if any).
5. Fourth paragraph: meaning of win/loss for teams.
6. Article length: 250–350 words.

Output JSON:
{
  "headline": "...",
  "body": "..."
}
`;

    // --- CALL GENERATIVE AI ---
    const model = genAI.getGenerativeModel({ model: "text-bison-001" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from AI
    const articleJSON = JSON.parse(text);

    // --- CREATE SANITY DRAFT ---
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
          children: [{ _type: "span", text: articleJSON.body }],
        },
      ],
      status: "review",
    };

    const createdArticle = await sanityClient.create(newArticle);
    console.log("Article created:", createdArticle._id);

    res.status(200).json({ message: "Article generated!", articleId: createdArticle._id });
  } catch (error) {
    console.error("Error generating article:", error);
    res.status(500).json({ message: "Internal error", error: error.message });
  }
}
