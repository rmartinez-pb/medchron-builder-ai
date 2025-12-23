import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MedicalEntity, EntityCategory } from "../types";

// Initialize Gemini Client
// NOTE: API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: "AIzaSyCZ9M0mUHsrjC57gPoap72IoiWw3Gc8328" });

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
      model: 'gemini-2.5-flash',
      contents: {
        parts: [filePart, { text: prompt }]
      },
      config: {
        thinkingConfig: { thinkingBudget: 2048 }, 
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
 * Groups facts by date.
 */
export const extractEntitiesFromProse = async (prose: string): Promise<MedicalEntity[]> => {
  
  const prompt = `
    Analyze the following medical prose description. 
    Create a detailed Medical Chronology.
    
    CRITICAL: You must GROUP all events and facts by DATE.
    For each unique date found in the text, create a single entry.
    Inside that entry, provide a list of specific facts/events as bullet points.

    The prose contains page citations like [Page X]. You must extract this page number for each fact.

    For each Date Entry:
    - Date: The unified date (YYYY-MM-DD preferred).
    - Summary: A brief headline summarizing the encounter or day's events.
    - Facts: An array of specific details.
    
    For each Fact:
    - Time: If available.
    - Category: (Diagnosis, Treatment, Symptom, Lab Result, Medication, Administrative, Other)
    - Detail: The specific fact description.
    - Page Number: Integer, extracted from [Page X].
    - Quote: Short verbatim snippet supporting this fact.
    
    Extract UMLS keywords at the Date Entry level if possible.
    
    Return the result as a JSON array of Date Entries.
  `;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "Date of the events in YYYY-MM-DD format if interpretable." },
        summary: { type: Type.STRING, description: "A summary headline for this date (e.g. 'Emergency Room Visit' or 'Follow-up Consultation')." },
        umlsEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
        facts: {
          type: Type.ARRAY,
          items: {
             type: Type.OBJECT,
             properties: {
                time: { type: Type.STRING, description: "Time of the specific fact if available." },
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
                detail: { type: Type.STRING, description: "The specific fact or event description." },
                pageNumber: { type: Type.INTEGER, description: "The page number found in the text [Page X]." },
                quote: { type: Type.STRING, description: "Verbatim quote supporting this fact." }
             },
             required: ["category", "detail"]
          }
        }
      },
      required: ["date", "summary", "facts"]
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