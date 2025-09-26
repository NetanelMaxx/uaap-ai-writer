// api/generateArticle.js

import { createClient } from "@sanity/client";
import { VertexAI } from "@google-cloud/vertexai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // --- STEP 1: INITIALIZE CLIENTS ---
    // The VertexAI library will AUTOMATICALLY find and use the GOOGLE_APPLICATION_CREDENTIALS environment variable.
    // We no longer need to parse it ourselves.
    
    const vertexAI = new VertexAI({
      project: process.env.SANITY_PROJECT_ID, // Your Google Cloud Project ID from env vars
      location: 'asia-southeast1',
    });

    const sanityClient = createClient({
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET,
      token: process.env.SANITY_API_TOKEN,
      useCdn: false,
      apiVersion: '2024-02-01',
    });
    
    const model = 'gemini-1.5-pro-001';
    const generativeModel = vertexAI.getGenerativeModel({ model: model });

    // --- STEP 2: PROCESS THE REQUEST ---
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
      Return ONLY a valid JSON object like this:
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

    const newArticle = { /* ... same as before ... */ }; // Shortened for brevity

    const createdArticle = await sanityClient.create(newArticle);
    console.log("!!! SUCCESS !!! Successfully created article:", createdArticle._id);

    return res.status(200).json({ message: "Article generated successfully!", articleId: createdArticle._id });

  } catch (error) {
    console.error("A critical error occurred:", error);
    return res.status(500).json({ message: "A critical error occurred", error: error.message });
  }
}