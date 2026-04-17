import { GoogleGenAI, Type } from "@google/genai";
import { Exercise, NotebookCell } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateExercises(cells: NotebookCell[]): Promise<Exercise[]> {
  const content = cells
    .filter(c => c.cell_type === 'markdown' || c.cell_type === 'code')
    .map(c => c.source.join(''))
    .join('\n\n')
    .slice(0, 15000); // Limit to avoid token issues

  const prompt = `
    Based on the following educational material (from a Jupyter Notebook), generate 3 practical Python exercises.
    Each exercise should be challenging but solvable using the concepts discussed in the text.
    
    IMPORTANT CONSTRAINTS:
    - You MAY generate exercises that require interactive user input (using input() function), as it is now supported via a browser prompt.
    - The exercises should focus on data processing, calculations, or logic that can be executed and verified by outputting results (print).
    - Provide a clear solution hint.
    
    Material:
    ${content}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              solution_hint: { type: Type.STRING },
            },
            required: ["title", "description", "solution_hint"],
          },
        },
      },
    });

    const data = JSON.parse(response.text || "[]");
    return data.map((ex: any, index: number) => ({
      ...ex,
      id: `ex-${Date.now()}-${index}`,
      completed: false
    }));
  } catch (error) {
    console.error("Error generating exercises:", error);
    return [];
  }
}

export async function partitionDays(cells: NotebookCell[]): Promise<{ id: string; title: string; cellRange: [number, number] }[]> {
  // Simple heuristic: look for H1 headings
  const days: { id: string; title: string; cellRange: [number, number] }[] = [];
  let currentStart = 0;

  cells.forEach((cell, index) => {
    if (cell.cell_type === 'markdown') {
      const source = cell.source.join('');
      const match = source.match(/^# (.*)/m);
      if (match) {
        if (days.length > 0) {
          days[days.length - 1].cellRange[1] = index;
        }
        days.push({
          id: `day-${days.length + 1}`,
          title: match[1].trim(),
          cellRange: [index, cells.length]
        });
      }
    }
  });

  if (days.length === 0) {
    // Default if no H1s found
    days.push({ id: 'day-1', title: 'Contenido General', cellRange: [0, cells.length] });
  }

  return days;
}
