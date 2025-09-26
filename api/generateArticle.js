// api/generateArticle.js

import { createClient } from "@sanity/client";
import { VertexAI } from "@google-cloud/vertexai";

// All configuration and initialization is now done inside the handler
// This ensures any and all errors are caught and logged properly.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // --- STEP 1: LOAD AND VALIDATE ENVIRONMENT VARIABLES ---
    const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
    const SANITY_DATASET = process.env.SANITY_DATASET;
    const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;
    const GOOGLE_SERVICE_ACCOUNT_JSON_STRING = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!GOOGLE_SERVICE_ACCOUNT_JSON_STRING) {
      throw new Error("FATAL: GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set!");
    }

    // --- STEP 2: PARSE THE SERVICE ACCOUNT AND FIX THE PRIVATE KEY ---
    const serviceAccountJSON = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON_STRING);

    // This is the critical fix for the private key's newline characters
    const credentials = {
      client_email: serviceAccountJSON.client_email,
      private_key: serviceAccountJSON.private_key.replace(/\\n/g, '\n')
    };

    // --- STEP 3: INITIALIZE CLIENTS ---
    const sanityClient = createClient({
      projectId: SANITY_PROJECT_ID,
      dataset: SANITY_DATASET,
      token: SANITY_API_TOKEN,
      useCdn: false,
      apiVersion: '2024-02-01',
    });

    const vertexAI = new VertexAI({
      project: credentials.project_id || serviceAccountJSON.project_id, // Use project_id from credentials
      location: 'asia-southeast1',
      credentials,
    });
    
    const model = 'gemini-1.5-pro-001';
    const generativeModel = vertexAI.getGenerativeModel({ model: model });

    // --- STEP 4: PROCESS THE REQUEST ---
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

    const newArticle = { /* ... same as before ... */ }; // Shortened for brevity

    const createdArticle = await sanityClient.create(newArticle);
    console.log("Successfully created article:", createdArticle._id);

    return res.status(200).json({ message: "Article generated successfully!", articleId: createdArticle._id });

  } catch (error) {
    // This will now catch ALL errors, including JSON parsing and initialization
    console.error("A critical error occurred:", error);
    return res.status(500).json({ message: "A critical error occurred", error: error.message });
  }
}