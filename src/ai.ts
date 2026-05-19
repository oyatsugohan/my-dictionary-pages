/**
 * Simple utility to interact with the Google Gemini API.
 */

export const getArticleSuggestions = async (existingTitles: string[], categories: string[], apiKey: string): Promise<string[]> => {
  if (!apiKey) return [];

  const prompt = `あなたは博識な百科事典の編集アシスタントです。
現在の記事のタイトル一覧: ${existingTitles.join(', ')}
現在のカテゴリー一覧: ${categories.join(', ')}

これらを踏まえて、次に作成すべき新しく興味深い記事のタイトルを3つ提案してください。
提案は、既存のタイトルと重複せず、ユーザーの興味を広げるようなものにしてください。

出力は以下のJSON形式の配列のみを返してください。余計な説明は不要です。
["提案タイトル1", "提案タイトル2", "提案タイトル3"]`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${apiKey}`, {
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
      const errorData = await response.json();
      console.error('Gemini API Error Response:', errorData);
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini API Full Response:', data);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    console.log('Gemini Raw Text:', text);
    
    // Clean up markdown code blocks if Gemini returns them
    // More robust JSON extraction: find the first [ and last ]
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    
    if (startIdx === -1 || endIdx === -1) {
      console.error('Could not find JSON array in Gemini response');
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
    console.error('Fetch/Network Error in getArticleSuggestions:', error);
    throw error;
  }
};
