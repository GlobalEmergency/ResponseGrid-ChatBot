import { createReadStream } from "node:fs";
import OpenAI from "openai";

const openai = new OpenAI();

export async function transcribeAudioFile(filePath: string): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: createReadStream(filePath),
  });

  return transcription.text;
}
