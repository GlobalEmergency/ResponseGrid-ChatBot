export interface SelectionOption {
  id: string;
  label: string;
}

export interface MessagingChannel {
  sendText(chatId: string, text: string): Promise<void>;
  sendSelection(chatId: string, text: string, options: SelectionOption[]): Promise<void>;
  /** Pide/asegura el teléfono verificado del usuario, mostrando `text` como mensaje. */
  promptPhoneShare(chatId: string, text: string): Promise<void>;
}
