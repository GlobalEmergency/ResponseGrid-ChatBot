export interface SelectionOption {
  id: string;
  label: string;
}

/** Un botón de respuesta rápida (tocable). El id vuelve como selección al pulsarlo. */
export interface QuickReply {
  id: string;
  label: string;
}

/** Propuesta de acción con botones tocables y/o un botón de enlace (CTA). */
export interface ChoicePrompt {
  text: string;
  /** Botones de respuesta rápida (máx. 3 en WhatsApp). */
  options?: QuickReply[];
  /** Botón CTA que abre una URL. */
  url?: string;
  urlLabel?: string;
}

export interface MessagingChannel {
  sendText(chatId: string, text: string): Promise<void>;
  sendSelection(chatId: string, text: string, options: SelectionOption[]): Promise<void>;
  /** Envía botones tocables (respuesta rápida y/o enlace). */
  sendChoices(chatId: string, prompt: ChoicePrompt): Promise<void>;
  /** Pide/asegura el teléfono verificado del usuario, mostrando `text` como mensaje. */
  promptPhoneShare(chatId: string, text: string): Promise<void>;
  /** Acusa recibo del mensaje entrante (leído + "escribiendo…") mientras se procesa. */
  indicateReceived(chatId: string, messageId?: string): Promise<void>;
}
