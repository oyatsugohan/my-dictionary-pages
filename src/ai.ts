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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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
      throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    // Clean up markdown code blocks if Gemini returns them
    const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};
