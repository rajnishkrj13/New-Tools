import { getState } from './documentStore';

export interface PromptRequest {
  title: string;
  message?: string;
  label: string;
  initial?: string;
  placeholder?: string;
  /** Hide what is typed and ask for it twice when `confirm` is set. */
  password?: boolean;
  confirm?: boolean;
  /** Choices shown as a list instead of a text field. */
  options?: { value: string; label: string }[];
  okLabel?: string;
  /** Returns a message when the value is not acceptable. */
  validate?: (value: string) => string | null;
  resolve: (value: string | null) => void;
}

/** Asks the user for one value in a small dialog. Resolves to null when cancelled. */
export function askText(request: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    // A question that is still open is cancelled by the new one.
    getState().prompt?.resolve(null);
    getState().setPrompt({ ...request, resolve });
  });
}
