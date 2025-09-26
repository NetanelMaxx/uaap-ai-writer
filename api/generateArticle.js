// api/generateArticle.js

import { createClient } from "@sanity/client";
// NEW: Import the Vertex AI library
import { VertexAI } from "@google-cloud/vertexai";

// --- CONFIGURATION ---
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

// NEW: Initialize Vertex AI client with specific region
const vertexAI = new VertexAI({
  project: process.env.SANITY_PROJECT_ID, // Your Google Cloud Project ID
  location: 'asia-southeast1', // Explicitly choose a region in Asia
});

// NEW: Define the model using the Vertex AI naming convention
const model = 'gemini-1.5-pro-001';

const generativeModel = vertexAI.getGenerativeModel({
    model: model,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 1,
      topP: 0.95,
    },
});

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

    // NEW: Call the model using the Vertex AI method
    const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
    const resp = await generativeModel.generateContent(request);
    const text = resp.response.candidates[0].content.parts[0].text;
    
    // Clean the response from markdown/json tags
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const articleJSON = JSON.parse(cleanedText);

    // --- Create article in Sanity ---
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
    // Add more detailed error logging
    if (error.response) {
      console.error("Error response data:", error.response.data);
    }
    return res.status(500).json({ message: "Error generating article", error: error.message });
  }
}