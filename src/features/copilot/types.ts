export type ToolCall = { name: string; arguments: unknown; result: unknown };
export type Candidate = {
  id: string;
  name: string;
  mrn?: string;
  phoneEnding?: string;
  dateOfBirth?: string | null;
  specialty?: string;
  fee?: number;
  followup_fee?: number;
  capacity?: number;
};
export type Draft = {
  id: string;
  conversationId: string;
  kind: 'REGISTER_PATIENT' | 'BOOK_APPOINTMENT';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'SUPERSEDED' | 'EXPIRED';
  expiresAt: number;
  preview: {
    fullName?: string;
    phone?: string;
    dateOfBirth?: string | null;
    estimatedAgeMonths?: number | null;
    ageRecordedOn?: string | null;
    address?: string;
    contactName?: string;
    matches?: Candidate[];
    patientName?: string;
    patientPhone?: string;
    mrn?: string;
    doctorName?: string;
    date?: string;
    visitType?: string;
    fee?: number;
    remainingCapacity?: number;
  };
  result?: { link?: string; token?: number; mrn?: string } | null;
};
export type CopilotEvent = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: 'LOCAL_DEMO' | 'LOCAL_TOOLS' | 'LIVE_AI';
  provider?: string;
  model?: string;
  toolCalls?: ToolCall[];
  actions?: Draft[];
  result?: { link?: string; token?: number; mrn?: string } | null;
};
export type Conversation = {
  id: string;
  title: string;
  revision: number;
  selectedPatientId: string | null;
  selectedDoctorId: string | null;
  events: CopilotEvent[];
};
export type AIStatus = {
  provider: string;
  model: string;
  configured: boolean;
  mode: string;
  patientToolsEnabled: boolean;
};
