export enum ProcessingStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  UPLOADING = 'UPLOADING',
  GENERATING_PROSE = 'GENERATING_PROSE',
  EXTRACTING_ENTITIES = 'EXTRACTING_ENTITIES',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum EntityCategory {
  DIAGNOSIS = 'Diagnosis',
  TREATMENT = 'Treatment',
  SYMPTOM = 'Symptom',
  LAB_RESULT = 'Lab Result',
  MEDICATION = 'Medication',
  ADMINISTRATIVE = 'Administrative',
  OTHER = 'Other'
}

export interface MedicalFact {
  time?: string;
  category: EntityCategory;
  detail: string;
  pageNumber?: number;
  quote?: string;
}

export interface MedicalEntity {
  date: string;
  summary: string; // High-level summary of the day/encounter
  facts: MedicalFact[]; // Bulleted list of specific facts
  umlsEntities?: string[];
}

export interface ProcessedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: Date;
  status: ProcessingStatus;
  proseDescription?: string;
  entities?: MedicalEntity[];
  error?: string;
  rawFile?: File; 
}

export interface TimelineEvent extends MedicalEntity {
  sourceDocumentId: string;
  sourceDocumentName: string;
  id: string; // Unique ID for the timeline event (the daily group)
}

// Helper type for the viewer interaction
export interface ViewerItem {
  date: string;
  category: string;
  summary: string; // This will hold the specific fact detail
  sourceDocumentName: string;
  sourceDocumentId: string;
  pageNumber?: number;
  quote?: string;
}
