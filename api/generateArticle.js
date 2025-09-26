// api/generateArticle.js

import { createClient } from "@sanity/client";
import { VertexAI } from "@google-cloud/vertexai";

// --- START OF CRITICAL DEBUGGING ---
// Check if the environment variable is loaded. This is the most likely point of failure.
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("FATAL ERROR: The GOOGLE_SERVICE_ACCOUNT_JSON environment variable was not found!");
}
// --- END OF CRITICAL DEBUGGING ---

// --- CONFIGURATION ---
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;

// Parse the Service Account JSON from the environment variable
const serviceAccountJSON = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Initialize Sanity client
const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  token: SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: '2024-02-01',
});

// Initialize Vertex AI with the parsed credentials.
const vertexAI = new VertexAI({
  project: serviceAccountJSON.project_id,
  location: 'asia-southeast1',
  credentials: {
    client_email: serviceAccountJSON.client_email,
    private_key: serviceAccountJSON.private_key,
  },
});

const model = 'gemini-1.5-pro-001';

const generativeModel = vertexAI.getGenerativeModel({ model: model });

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

      **Output Format:**
      Return ONLY a valid JSON object like this, with no other text before or after it:
      {
        "headline": "Your generated headline here",
        "body": "Your full generated article text here."
      }
    `;

    const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    const resp = await generativeModel.generateContent(request);
    const text = resp.response.candidates[0].content.parts[0].text;
    
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const articleJSON = JSON.parse(cleanedText);

    const newArticle = {
      _type: "article",
      title: articleJSON.headline,
      slug: {
        _type: "slug",
        current: articleJSON.headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 90),
      },
      content: [{ _type: "block", style: "normal", children: [{ _type: "span", text: articleJSON.body }] }],
      status: "review",
    };

    const createdArticle = await sanityClient.create(newArticle);
    console.log("Successfully created article:", createdArticle._id);

    return res.status(200).json({ message: "Article generated successfully!", articleId: createdArticle._id });

  } catch (error) {
    console.error("Error generating article:", error);
    if (error.response) { console.error("Error response data:", error.response.data); }
    return res.status(500).json({ message: "Error generating article", error: error.message });
  }
}
