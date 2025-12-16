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

export interface MedicalEntity {
  date: string;
  time?: string;
  category: EntityCategory;
  summary: string;
  details: string;
  confidence?: number;
  umlsEntities?: string[]; // New field for UMLS based entities
  pageNumber?: number; // The page number where this event occurs
  quote?: string; // Verbatim text from the document supporting this event
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
  rawFile?: File; // Kept for potential re-processing or preview, though not strictly persisted
}

export interface TimelineEvent extends MedicalEntity {
  sourceDocumentId: string;
  sourceDocumentName: string;
  id: string; // Unique ID for the timeline event
}