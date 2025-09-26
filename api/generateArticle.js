const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@sanity/client');

// --- CONFIGURATION ---
// Load credentials from environment variables (important for security)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN; // A token with write access

// Initialize clients
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  token: SANITY_API_TOKEN,
  useCdn: false, // `false` because we're writing data
});

// --- THE MAIN FUNCTION ---
export default async function handler(req, res) {
  // 1. Basic security: Check if the request is a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 2. Get the game data from the request body (sent by the Sanity webhook)
    const gameData = req.body;
    console.log('Received game data:', gameData);

    // --- 3. CRAFT THE RICH DATA PROMPT ---
    const prompt = `
      You are an expert UAAP sports journalist writing a game recap for a university sports website. Your tone should be engaging, exciting, and professional.
      Generate a compelling news article based *only* on the following structured data. Do not invent any facts.

      **Game Information:**
      - Winning Team: ${gameData.winningTeam}
      - Winning Score: ${gameData.winningScore}
      - Losing Team: ${gameData.losingTeam}
      - Losing Score: ${gameData.losingScore}

      **Star Player of the Game:**
      - Name: ${gameData.topPerformer.name}
      - Stats: ${gameData.topPerformer.points} points, ${gameData.topPerformer.rebounds} rebounds, ${gameData.topPerformer.assists} assists.

      **Key Game Highlights (if any):**
      ${gameData.highlights ? `- ${gameData.highlights.join('\n- ')}` : 'No specific highlights provided.'}

      **Article Requirements:**
      1.  Create a catchy, dynamic headline for the article.
      2.  The first paragraph should summarize the game's outcome, mentioning the final score and the winner.
      3.  The second paragraph should focus on the performance of the star player, ${gameData.topPerformer.name}, weaving their stats into the narrative.
      4.  If there are key highlights, dedicate a paragraph to describing these moments.
      5.  The final paragraph should briefly mention what this win means for ${gameData.winningTeam} and what's next for ${gameData.losingTeam}.
      6.  The entire article should be between 250 and 350 words.

      **Output Format:**
      Return the article in a simple JSON format like this:
      {
        "headline": "Your generated headline here",
        "body": "Your full generated article text here."
      }
    `;

    // --- 4. CALL THE GEMINI API ---
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response from Gemini
    const articleJSON = JSON.parse(text);

    // --- 5. CREATE THE DRAFT IN SANITY ---
    const newArticle = {
      _type: 'article',
      title: articleJSON.headline,
      slug: {
        _type: 'slug',
        current: articleJSON.headline.toLowerCase().replace(/\s+/g, '-').slice(0, 90),
      },
      // Convert plain text body to Sanity's Portable Text format
      content: [
        {
          _type: 'block',
          style: 'normal',
          children: [
            {
              _type: 'span',
              text: articleJSON.body,
            },
          ],
        },
      ],
      status: 'review', // Set status to "Ready for Review"
    };

    const createdArticle = await sanityClient.create(newArticle);
    console.log('Successfully created article:', createdArticle._id);

    // Send a success response back
    res.status(200).json({ message: 'Article generated successfully!', articleId: createdArticle._id });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'An internal error occurred.', error: error.message });
  }
}