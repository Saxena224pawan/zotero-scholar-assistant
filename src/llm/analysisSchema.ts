export const highlightListSchema = {
  type: "object",
  properties: {
    highlights: {
      type: "array",
      minItems: 6,
      maxItems: 15,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          category: { type: "string", enum: ["problem", "contribution", "concept", "methodology", "equation", "results", "limitation", "conclusion"] },
          explanation: { type: "string" },
        },
        required: ["text", "category", "explanation"],
      },
    },
  },
  required: ["highlights"],
} as const;

export const studyNoteSchema = {
  type: "object",
  properties: {
    studyNote: {
      type: "object",
      properties: {
        summary: { type: "string" },
        keyContributions: { type: "array", items: { type: "string" } },
        importantConcepts: { type: "array", items: { type: "string" } },
        methodology: { type: "string" },
        importantResults: { type: "array", items: { type: "string" } },
        limitations: { type: "array", items: { type: "string" } },
        keyTakeaways: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "keyContributions", "importantConcepts", "methodology", "importantResults", "limitations", "keyTakeaways"],
    },
  },
  required: ["studyNote"],
} as const;

export const quizListSchema = {
  type: "object",
  properties: {
    quiz: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        },
        required: ["question", "answer", "explanation", "difficulty"],
      },
    },
  },
  required: ["quiz"],
} as const;

export const analysisSchema = {
  type: "object",
  properties: {
    ...highlightListSchema.properties,
    ...studyNoteSchema.properties,
    ...quizListSchema.properties,
  },
  required: ["highlights", "studyNote", "quiz"],
} as const;
