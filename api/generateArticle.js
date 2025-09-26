// api/generateArticle.js

import { createClient } from "@sanity/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;

// Initialize Sanity client
const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  token: SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: '2024-02-01',
});

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const gameData = req.body;
    console.log("Received game data:", gameData);

    const prompt = `
      You are an expert UAAP sports journalist writing a game recap for a university sports website. Your tone should be engaging, exciting, and professional.
      Generate a compelling news article based *only* on the following structured data.

      **Game Information:**
      - Winning Team: ${gameData.winningTeam}
      - Winning Score: ${gameData.winningScore}
      - Losing Team: ${gameData.losingTeam}
      - Losing Score: ${gameData.losingScore}

      **Star Player of the Game:**
      - Name: ${gameData.topPerformer.name || 'N/A'}
      - Stats: ${gameData.topPerformer.points} points, ${gameData.topPerformer.rebounds} rebounds, ${gameData.topPerformer.assists} assists.

      **Key Game Highlights (if any):**
      ${gameData.highlights ? `- ${gameData.highlights.join('\n- ')}` : 'No specific highlights provided.'}

      **Article Requirements:**
      1. Create a catchy, dynamic headline.
      2. The body of the article should be a well-written narrative of 250-350 words, incorporating the game result and the star player's performance.

      **Output Format:**
      Return ONLY a valid JSON object like this, with no other text before or after it:
      {
        "headline": "Your generated headline here",
        "body": "Your full generated article text here."
      }
    `;

    // --- Call Gemini with the stable model name ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const articleJSON = JSON.parse(text);

    // --- Create article in Sanity ---
    const newArticle = {
      _type: "article",
      title: articleJSON.headline,
      slug: {
        _type: "slug",
        current: articleJSON.headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 90),
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
    console.log("Successfully created article:", createdArticle._id);

    return res
      .status(200)
      .json({ message: "Article generated successfully!", articleId: createdArticle._id });

  } catch (error) {
    console.error("Error generating article:", error);
    return res.status(500).json({ message: "Error generating article", error: error.message });
  }
}