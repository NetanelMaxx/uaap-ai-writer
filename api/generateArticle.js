// api/generateArticle.js

import { createClient } from "@sanity/client";
// NEW: Import the OpenAI library
import OpenAI from "openai";

// This is the new, simpler Groq client initialization
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1', // This points the client to Groq's servers
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // --- STEP 1: INITIALIZE SANITY CLIENT ---
    const sanityClient = createClient({
      projectId: process.env.SANITY_PROJECT_ID, // Your Sanity Project ID
      dataset: process.env.SANITY_DATASET,
      token: process.env.SANITY_API_TOKEN,
      useCdn: false,
      apiVersion: '2024-02-01',
    });

    // --- STEP 2: PROCESS THE REQUEST ---
    const gameData = req.body;
    console.log("Received game data:", gameData);

    const prompt = `
      You are an expert UAAP sports journalist. Based only on the data below, write a compelling game recap.

      Data:
      - Winning Team: ${gameData.winningTeam} (${gameData.winningScore})
      - Losing Team: ${gameData.losingTeam} (${gameData.losingScore})
      - Star Player: ${gameData.topPerformer.name} (${gameData.topPerformer.points} pts, ${gameData.topPerformer.rebounds} rebs, ${gameData.topPerformer.assists} asts)

      Your response MUST be a single, valid JSON object, with no other text, comments, or markdown.
      The JSON object must have two keys: "headline" (a string) and "body" (a string of 250-350 words).
    `;

    // --- STEP 3: CALL THE GROQ API ---
    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: 'You are a helpful assistant that only outputs valid JSON.'
            },
            {
                role: 'user',
                content: prompt,
            }
        ],
        model: 'llama3-8b-8192', // A great, fast model available on Groq
        temperature: 0.7,
        response_format: { type: 'json_object' } // Ask for JSON response
    });
    
    const responseText = chatCompletion.choices[0].message.content;
    const articleJSON = JSON.parse(responseText);

    // --- STEP 4: CREATE THE ARTICLE IN SANITY ---
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
    console.log("!!! SUCCESS !!! Successfully created article:", createdArticle._id);

    return res.status(200).json({ message: "Article generated successfully!", articleId: createdArticle._id });

  } catch (error) {
    console.error("A critical error occurred:", error);
    return res.status(500).json({ message: "A critical error occurred", error: error.message });
  }
}