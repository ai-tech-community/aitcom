import type { EventFormData } from "../event-form-model";

/** Every section edits a slice of the one form state. */
export interface SectionProps {
  form: EventFormData;
  update: (patch: Partial<EventFormData>) => void;
}
