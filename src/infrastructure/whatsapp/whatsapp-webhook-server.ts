import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { transcribeAudioFile } from "../../audio/transcribe.js";
import type { AccountRegistry } from "../../application/account-registry.js";
import type { ConversationService } from "../../application/conversation-service.js";
import type { WhatsAppAccount } from "../../domain/account.js";
import { isValidWhatsAppSignature } from "./whatsapp-signature.js";
import { WhatsAppChannelAdapter } from "./whatsapp-channel-adapter.js";
import { GRAPH_API_VERSION } from "./graph-api.js";
import { canonicalPhone } from "./phone.js";

const WEBHOOK_PATH = "/webhook/whatsapp";

export interface WhatsAppWebhookOptions {
  appSecret: string;
  verifyToken: string;
  port: number;
}

export function startWhatsAppWebhookServer(
  registry: AccountRegistry,
  conversationService: ConversationService,
  options: WhatsAppWebhookOptions,
): Server {
  const server = createServer((req, res) => {
    void handleRequest(req, res, registry, conversationService, options);
  });

  server.listen(options.port, "127.0.0.1", () => {
    console.log(`Servidor de webhook de WhatsApp escuchando en 127.0.0.1:${options.port}${WEBHOOK_PATH}`);
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  registry: AccountRegistry,
  conversationService: ConversationService,
  options: WhatsAppWebhookOptions,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname !== WEBHOOK_PATH) {
    res.writeHead(404).end();
    return;
  }

  if (req.method === "GET") {
    handleVerification(url, res, options.verifyToken);
    return;
  }

  if (req.method === "POST") {
    await handleInbound(req, res, registry, conversationService, options.appSecret);
    return;
  }

  res.writeHead(405).end();
}

function handleVerification(url: URL, res: ServerResponse, verifyToken: string): void {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    res.writeHead(200, { "Content-Type": "text/plain" }).end(challenge);
    return;
  }

  res.writeHead(403).end();
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function handleInbound(
  req: IncomingMessage,
  res: ServerResponse,
  registry: AccountRegistry,
  conversationService: ConversationService,
  appSecret: string,
): Promise<void> {
  const rawBody = await readRawBody(req);
  const signatureHeaderValue = req.headers["x-hub-signature-256"];
  const signatureHeader = Array.isArray(signatureHeaderValue) ? signatureHeaderValue[0] : signatureHeaderValue;

  if (!isValidWhatsAppSignature(rawBody, signatureHeader, appSecret)) {
    res.writeHead(401).end();
    return;
  }

  res.writeHead(200).end("EVENT_RECEIVED");

  try {
    const payload = JSON.parse(rawBody.toString("utf8"));
    await processPayload(payload, registry, conversationService);
  } catch (error) {
    console.error("Error procesando webhook de WhatsApp:", error);
  }
}

async function processPayload(
  payload: any,
  registry: AccountRegistry,
  conversationService: ConversationService,
): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const account = phoneNumberId ? registry.findByWhatsappPhoneNumberId(phoneNumberId) : undefined;

      if (!account || account.channel !== "whatsapp") {
        continue;
      }

      for (const message of value.messages ?? []) {
        await handleMessage(message, account, conversationService);
      }
    }
  }
}

async function handleMessage(
  message: any,
  account: WhatsAppAccount,
  conversationService: ConversationService,
): Promise<void> {
  const channel = new WhatsAppChannelAdapter(account);
  const chatId = message.from as string;
  const verifiedPhone = canonicalPhone(chatId);

  if (message.type === "text" && message.text?.body) {
    await conversationService.handle({ account, chatId, text: message.text.body, verifiedPhone }, channel);
    return;
  }

  if (message.type === "audio" && message.audio?.id) {
    const audioPath = await downloadWhatsAppMedia(message.audio.id, account);
    try {
      const transcript = await transcribeAudioFile(audioPath);
      await channel.sendText(chatId, `He entendido: "${transcript}"`);
      await conversationService.handle({ account, chatId, text: transcript, verifiedPhone }, channel);
    } finally {
      await unlink(audioPath).catch(() => undefined);
    }
    return;
  }

  if (message.type === "location" && message.location) {
    const { latitude, longitude } = message.location;
    await conversationService.handle({ account, chatId, location: { latitude, longitude }, verifiedPhone }, channel);
    return;
  }

  if (message.type === "interactive" && message.interactive?.list_reply) {
    await conversationService.handle(
      { account, chatId, selectionCallback: message.interactive.list_reply.id, verifiedPhone },
      channel,
    );
    return;
  }

  await channel.sendText(
    chatId,
    "Ahora mismo puedo entender texto, notas de voz, ubicaciones compartidas y selecciones de lista.",
  );
}

async function downloadWhatsAppMedia(mediaId: string, account: WhatsAppAccount): Promise<string> {
  const metaResponse = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${account.whatsappAccessToken}` },
  });

  if (!metaResponse.ok) {
    throw new Error(`No se pudo resolver el media de WhatsApp: ${metaResponse.status}`);
  }

  const meta = (await metaResponse.json()) as { url: string };

  const fileResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${account.whatsappAccessToken}` } });

  if (!fileResponse.ok) {
    throw new Error(`No se pudo descargar el media de WhatsApp: ${fileResponse.status}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const filePath = join(tmpdir(), `whatsapp-voice-${randomUUID()}.ogg`);
  await writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}
