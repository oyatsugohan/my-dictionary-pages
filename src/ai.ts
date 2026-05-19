/**
 * Simple utility to interact with the Google Gemini API.
 */

export const getArticleSuggestions = async (existingTitles: string[], categories: string[], apiKey: string): Promise<string[]> => {
  const cleanApiKey = apiKey.trim();
  if (!cleanApiKey) return [];

  const prompt = `あなたは博識な百科事典の編集アシスタントです。
現在の記事のタイトル一覧: ${existingTitles.join(', ')}
現在のカテゴリー一覧: ${categories.join(', ')}

これらを踏まえて、次に作成すべき新しく興味深い記事のタイトルを3つ提案してください。
提案は、既存のタイトルと重複せず、ユーザーの興味を広げるようなものにしてください。

出力は以下のJSON形式の配列のみを返してください。余計な説明は不要です。
["提案タイトル1", "提案タイトル2", "提案タイトル3"]`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanApiKey}`;
    console.log('Fetching AI suggestions from Gemini 1.5 Flash...');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: { message: `HTTP error ${response.status}` } };
      }
      console.error('Gemini API Error Response:', errorData);
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini API Success');
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    // Clean up markdown code blocks if Gemini returns them
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    
    if (startIdx === -1 || endIdx === -1) {
      console.error('Could not find JSON array in Gemini response. Raw text:', text);
      return [];
    }
    
    const jsonString = text.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonString);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError, 'String:', jsonString);
      throw new Error('AIの回答形式が正しくありませんでした。');
    }
  } catch (error) {
    console.error('Detailed error in getArticleSuggestions:', error);
    throw error;
  }
};
