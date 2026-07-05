/**
 * Convierte el Markdown que produce el agente al formato nativo de WhatsApp.
 *
 * El agente escribe Markdown estándar (`**negrita**`, `~~tachado~~`, títulos `#`,
 * enlaces `[t](u)`). WhatsApp usa otra sintaxis: negrita con UN asterisco
 * (`*negrita*`), cursiva `_x_`, tachado `~x~`, y no entiende títulos ni enlaces
 * Markdown. Sin esta conversión aparecían asteriscos sueltos por los `**`.
 */
export function markdownToWhatsApp(md: string): string {
  let s = md;

  // Tachado: ~~texto~~ -> ~texto~
  s = s.replace(/~~(.+?)~~/g, "~$1~");

  // Negrita: **texto** o __texto__ -> *texto*
  s = s.replace(/\*\*(.+?)\*\*/g, "*$1*");
  s = s.replace(/__(.+?)__/g, "*$1*");

  // Títulos Markdown "# Título" -> negrita "*Título*"
  s = s.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Enlaces [texto](url) -> texto (url)
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");

  return s;
}
