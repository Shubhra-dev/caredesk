export type PatientAgeInput =
  | {
      kind: "dateOfBirth";
      dateOfBirth: string;
    }
  | {
      kind: "estimated";
      estimatedAgeMonths: number;
      ageRecordedOn: string;
    };

export type PatientRegistrationInput = {
  fullName: string;
  phone: string;
  age: PatientAgeInput;
  address?: string;
  contactName?: string;
  contactRelationship?: string;
};
