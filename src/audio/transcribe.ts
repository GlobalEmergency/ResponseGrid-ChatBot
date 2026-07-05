import { createReadStream } from "node:fs";
import OpenAI from "openai";

/** Tamaño máximo de audio a transcribir (protege coste OpenAI y disco). */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

// Cliente perezoso: no se crea al importar el módulo (evita exigir OPENAI_API_KEY
// a quien solo importa esto de forma transitiva, p. ej. el servidor de webhook).
let openai: OpenAI | undefined;
function client(): OpenAI {
  return (openai ??= new OpenAI());
}

export async function transcribeAudioFile(filePath: string): Promise<string> {
  const transcription = await client().audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: createReadStream(filePath),
  });

  return transcription.text;
}
