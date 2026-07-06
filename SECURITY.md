# Security Policy / Política de seguridad

## Reporting a vulnerability (English)

**Please do not open a public issue for security vulnerabilities.**

Report privately using GitHub's
[**Report a vulnerability**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/security/advisories/new)
(Security → Advisories). We aim to acknowledge within a few business days.

Please include: affected component, steps to reproduce, and impact. If you have
a fix in mind, feel free to suggest it.

### Scope notes

The security boundary of this system is the **ResponseGrid API** (JWT +
role-based authorization), not the LLM. The bot can never exceed the
authenticated user's permissions. Especially valuable reports:

- Any way for the bot to act beyond the authenticated user's grants.
- Bypassing WhatsApp webhook HMAC verification.
- Leaking secrets (tokens, API keys) into logs or model context.
- Authenticating as a phone number other than the one verified by the
  messaging platform.

---

## Reportar una vulnerabilidad (español)

**Por favor, no abras una issue pública para vulnerabilidades de seguridad.**

Repórtala en privado con
[**Report a vulnerability**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/security/advisories/new)
de GitHub (Security → Advisories). Intentamos acusar recibo en pocos días
laborables.

Incluye: componente afectado, pasos para reproducir e impacto. Si tienes una
propuesta de arreglo, adelante.

### Alcance

La frontera de seguridad es la **API de ResponseGrid** (JWT + autorización por
roles), no el LLM. El bot nunca puede exceder los permisos del usuario
autenticado. Reportes especialmente valiosos:

- Que el bot actúe más allá de los permisos (grants) del usuario autenticado.
- Saltarse la verificación HMAC del webhook de WhatsApp.
- Fuga de secretos (tokens, API keys) a logs o al contexto del modelo.
- Autenticarse con un teléfono distinto al verificado por la plataforma de
  mensajería.
