import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MedicalEntity, EntityCategory } from "../types";

// Initialize Gemini Client
// NOTE: API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Converts a File object to a Base64 string.
 */
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Step 1: Generate a detailed prose description of the document.
 * Uses gemini-2.5-flash (as requested) for understanding of medical docs.
 */
export const generateDocumentProse = async (file: File): Promise<string> => {
  const filePart = await fileToGenerativePart(file);

  const prompt = `
    You are an expert medical physician consultant. 
    Analyze the attached medical document carefully.
    Create a detailed, objective prose description of the document's content. 
    
    CRITICAL INSTRUCTION: You MUST cite the page number for every fact you mention. 
    Use the format [Page X] at the start of sentences or after key facts.
    If the document is a single page/image, use [Page 1].

    Focus specifically on:
    1. Dates of service.
    2. Patient symptoms and complaints.
    3. Diagnoses made.
    4. Treatments, procedures, and medications administered.
    5. Lab results or objective findings.
    6. Outcomes or discharge instructions.
    
    Write this as a cohesive narrative summary that captures all factual medical events.
    Include all dates or key clinical values from each page.
    All the information must be derived solely from the document and be literally accurate.
  `;

  try {
    const response = await ai.models.generateContent({
      // model: 'gemini-3-pro-preview',
      model: 'gemini-2.5-flash',
      contents: {
        parts: [filePart, { text: prompt }]
      },
      config: {
        thinkingConfig: { thinkingBudget: 2048 }, // Enable thinking for deeper analysis of the image/pdf
      }
    });

    return response.text || "No description generated.";
  } catch (error) {
    console.error("Error generating prose:", error);
    throw new Error("Failed to generate document description.");
  }
};

/**
 * Step 2: Disentangle facts from the prose into a JSON schema.
 * Uses gemini-2.5-flash for structured data extraction.
 */
export const extractEntitiesFromProse = async (prose: string): Promise<MedicalEntity[]> => {
  const umlsExamples = `
    [
      {
        "text": "The patient reports severe pain for the past week; diagnosis is urinary tract infection, and a physical examination was performed during the visit.",
        "entities": ["Patients", "Pain", "week", "Diagnosis", "Urinary tract infection", "Physical Examination", "Visit", "Records", "Medical History", "Pharmaceutical Preparations"]
      },
      {
        "text": "During today’s visit, the provider reviewed the patient’s medical history and records and ordered magnetic resonance imaging for persistent pain.",
        "entities": ["Patients", "Visit", "Provider", "today", "Medical History", "Records", "Magnetic Resonance Imaging", "Pain", "Diagnosis", "Physical Examination"]
      },
      {
        "text": "Diagnosis: urinary tract infection. The provider recommended pharmaceutical preparations and documented the evaluation after a physical examination.",
        "entities": ["Diagnosis", "Urinary tract infection", "Provider", "Pharmaceutical Preparations", "Physical Examination", "Evaluation", "Records", "Patients", "Visit", "Medical History"]
      },
      {
        "text": "The patient’s pain has continued for a week; the provider documented the visit in the records and updated the medical history after examination.",
        "entities": ["Patients", "Pain", "week", "Provider", "Visit", "Records", "Medical History", "Physical Examination", "Diagnosis", "Pharmaceutical Preparations"]
      },
      {
        "text": "At the visit, a physical examination was completed and the diagnosis was recorded; magnetic resonance imaging was requested to evaluate ongoing pain.",
        "entities": ["Visit", "Physical Examination", "Diagnosis", "Records", "Magnetic Resonance Imaging", "Evaluation", "Pain", "Patients", "Provider", "Medical History"]
      },
      {
        "text": "The provider reviewed records and medical history and noted a urinary tract infection diagnosis; the patient reports pain starting a week ago.",
        "entities": ["Provider", "Records", "Medical History", "Urinary tract infection", "Diagnosis", "Patients", "Pain", "week", "Visit", "Physical Examination"]
      }
    ]
  `;

  const prompt = `
    Analyze the following medical prose description. 
    Disentangle the text into individual fact-based entities (events) for a medical chronology.
    
    The prose contains page citations like [Page X]. You must extract this page number for each event.

    For each event, extract:
    - Date (YYYY-MM-DD format if possible, or original text)
    - Time (if available)
    - Category (Diagnosis, Treatment, Symptom, Lab Result, Medication, Administrative, Other)
    - Summary (Brief title)
    - Details (Full description from the prose)
    - Page Number (Integer, extracted from [Page X] markers)
    - Quote (A short, verbatim text snippet from the description that supports this fact)
    - umlsEntities (A list of UMLS-based tags extracted from the details, such as "Pain", "Patients", "Diagnosis", "Provider", etc.)

    Here are examples of how to map text to 'umlsEntities' based on UMLS standards:
    ${umlsExamples}
    
    Return the result as a JSON array.
  `;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "Date of the event in YYYY-MM-DD format if interpretable, otherwise original string." },
        time: { type: Type.STRING, description: "Time of the event if specified." },
        category: { 
          type: Type.STRING, 
          enum: [
            EntityCategory.DIAGNOSIS,
            EntityCategory.TREATMENT,
            EntityCategory.SYMPTOM,
            EntityCategory.LAB_RESULT,
            EntityCategory.MEDICATION,
            EntityCategory.ADMINISTRATIVE,
            EntityCategory.OTHER
          ]
        },
        summary: { type: Type.STRING, description: "A concise 3-5 word title for the event." },
        details: { type: Type.STRING, description: "Detailed description of the event extracted from the text." },
        pageNumber: { type: Type.INTEGER, description: "The page number (e.g. 1, 2) where this event is located." },
        quote: { type: Type.STRING, description: "A short verbatim text snippet supporting the event." },
        umlsEntities: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "List of UMLS entities identified in the event details (e.g. Pain, Patients, Diagnosis)."
        }
      },
      required: ["date", "category", "summary", "details"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ text: prose }, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const jsonText = response.text;
    if (!jsonText) return [];
    
    return JSON.parse(jsonText) as MedicalEntity[];
  } catch (error) {
    console.error("Error extracting entities:", error);
    throw new Error("Failed to extract entities from prose.");
  }
};