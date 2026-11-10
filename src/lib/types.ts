export type User = { id: string; name: string; email: string; role: 'ADMIN' | 'RECEPTIONIST' };
export type Patient = {
  id: string;
  mrn: string;
  full_name: string;
  phone: string;
  dob: string | null;
  estimated_months: number | null;
  age_recorded_on: string | null;
  address: string;
  contact_name: string;
  created_at: string;
};
export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  fee: number;
  followup_fee: number;
  capacity: number;
  active: number;
};
export type AppointmentStatus =
  'BOOKED' | 'CHECKED_IN' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type Appointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  full_name: string;
  mrn: string;
  phone: string;
  doctor_name: string;
  specialty: string;
  visit_date: string;
  token: number;
  visit_type: 'NEW' | 'FOLLOW_UP';
  status: AppointmentStatus;
  invoice_id: string;
  invoice_number: string;
  total: number;
  paid: number;
};
export type Invoice = {
  id: string;
  number: string;
  appointment_id: string;
  full_name: string;
  mrn: string;
  phone: string;
  doctor_name: string;
  visit_date: string;
  token: number;
  total: number;
  paid: number;
  appointment_status: AppointmentStatus;
};
export type Payment = {
  id: string;
  seq: number;
  amount: number;
  method: string;
  reference: string;
  created_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
  recorded_by: string;
};
export type Report = {
  date: string;
  gross: number;
  reversed: number;
  net: number;
  due: number;
  byMethod: { method: string; amount: number; count: number }[];
  appointmentCounts: { status: AppointmentStatus; count: number }[];
};
export type Dashboard = {
  date: string;
  patientCount: number;
  doctorCount: number;
  appointmentCount: number;
  report?: Report;
  appointments: Appointment[];
};
export type PatientInput = {
  fullName: string;
  phone: string;
  dateOfBirth?: string | null;
  estimatedAgeMonths?: number | null;
  ageRecordedOn?: string | null;
  address: string;
  contactName: string;
};
