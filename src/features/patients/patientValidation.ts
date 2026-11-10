import type { PatientAgeInput, PatientRegistrationInput } from "./types";

type PatientContactInput = {
  fullName: string;
  phone: string;
};

type PatientContactErrors = {
  fullName?: string;
  phone?: string;
};

type PatientContactValidationResult =
  | {
      success: true;
      data: PatientContactInput;
    }
  | {
      success: false;
      errors: PatientContactErrors;
    };

type PatientRegistrationErrors = PatientContactErrors & {
  age?: string;
};

type PatientRegistrationValidationResult =
  | {
      success: true;
      data: PatientRegistrationInput;
    }
  | {
      success: false;
      errors: PatientRegistrationErrors;
    };

function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");

  if (compact.startsWith("+880")) {
    return `0${compact.slice(4)}`;
  }

  if (compact.startsWith("00880")) {
    return `0${compact.slice(5)}`;
  }

  if (compact.startsWith("880")) {
    return `0${compact.slice(3)}`;
  }

  return compact;
}

export function validatePatientContact(
  input: PatientContactInput,
): PatientContactValidationResult {
  const fullName = input.fullName.trim();
  const phone = normalizePhone(input.phone);

  const errors: PatientContactErrors = {};

  if (!fullName) {
    errors.fullName = "Patient name is required.";
  } else if (fullName.length > 120) {
    errors.fullName = "Patient name must be 120 characters or fewer.";
  }

  if (!phone) {
    errors.phone = "Contact number is required.";
  } else if (!/^01\d{9}$/.test(phone)) {
    errors.phone = "Enter a Bangladesh mobile number, such as 01712345678.";
  }

  if (errors.fullName || errors.phone) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      fullName,
      phone,
    },
  };
}

function getLocalDateString(): string {
  const now = new Date();

  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const isLeapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);

  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  const maximumDay = daysInMonth[month - 1];

  return maximumDay !== undefined && day <= maximumDay;
}

function getAgeError(age: PatientAgeInput, today: string): string | undefined {
  if (age.kind === "dateOfBirth") {
    if (!isValidDateOnly(age.dateOfBirth)) {
      return "Enter a valid date of birth.";
    }

    if (age.dateOfBirth > today) {
      return "Date of birth cannot be in the future.";
    }

    return undefined;
  }

  if (
    !Number.isSafeInteger(age.estimatedAgeMonths) ||
    age.estimatedAgeMonths < 0
  ) {
    return "Estimated age must be a non-negative whole number of months.";
  }

  if (!isValidDateOnly(age.ageRecordedOn)) {
    return "Enter a valid age recording date.";
  }

  if (age.ageRecordedOn > today) {
    return "Age recording date cannot be in the future.";
  }

  return undefined;
}

export function validatePatientRegistration(
  input: PatientRegistrationInput,
  today: string = getLocalDateString(),
): PatientRegistrationValidationResult {
  if (!isValidDateOnly(today)) {
    throw new Error("Validation requires a valid YYYY-MM-DD today value.");
  }

  const contactResult = validatePatientContact(input);
  const ageError = getAgeError(input.age, today);

  if (contactResult.success === false) {
    const errors: PatientRegistrationErrors = {
      ...contactResult.errors,
    };

    if (ageError !== undefined) {
      errors.age = ageError;
    }

    return {
      success: false,
      errors,
    };
  }

  if (ageError !== undefined) {
    return {
      success: false,
      errors: {
        age: ageError,
      },
    };
  }

  return {
    success: true,
    data: {
      ...input,
      ...contactResult.data,
    },
  };
}
