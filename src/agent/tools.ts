import { RunContext, tool } from "@openai/agents";
import { z } from "zod";
import type { AgentContext } from "./context.js";
import {
  TrustedAuthClient,
  PhoneNotFoundError,
  EmailAlreadyExistsError,
} from "../infrastructure/responsegrid/trusted-auth-client.js";

const trustedAuthClient = new TrustedAuthClient();

const resourceTypeSchema = z.enum([
  "collection_point",
  "delivery_point",
  "collection_and_delivery",
  "warehouse",
  "transport",
  "supplier",
  "venue",
]);

const resourceStatusSchema = z.enum([
  "hidden",
  "active",
  "saturated",
  "paused",
  "closed",
]);

const categorySchema = z.enum([
  "food",
  "water",
  "hygiene",
  "clothing",
  "medical",
  "shelter",
  "tools",
  "other",
  "medicines",
  "medical_equipment",
  "medical_supplies",
  "medical_personnel",
  "food_fresh",
  "food_non_perishable",
  "hygiene_infantile",
  "hygiene_personal",
  "tools_extraction",
  "other_pets",
]);

const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);

const locationSchema = z.object({
  address: z.string().describe("Dirección o descripción de la ubicación."),
  latitude: z.number().describe("Latitud entre -90 y 90."),
  longitude: z.number().describe("Longitud entre -180 y 180."),
});

const supplyLineSchema = z.object({
  name: z.string().describe("Nombre del suministro, material o recurso."),
  quantity: z.number().positive().describe("Cantidad positiva."),
  category: categorySchema.describe("Categoría normalizada del suministro."),
  unit: z.string().optional().describe("Unidad: litros, cajas, unidades, kg, etc."),
  supplyId: z.string().uuid().optional().describe("ID canónico del suministro, si existe."),
  presentation: z
    .string()
    .optional()
    .describe("Presentación: ampolla, EV, inhalador, caja, palé, etc."),
  expiresAt: z
    .string()
    .optional()
    .describe("Fecha de caducidad o frescura en formato YYYY-MM-DD, si aplica."),
});

const authorSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  note: z.string().optional(),
  verified: z.boolean().optional(),
  source: z.string().optional(),
});

const emergencyRefSchema = {
  emergencyId: z
    .string()
    .uuid()
    .optional()
    .describe("UUID de la emergencia. Si se omite se usa RESPONSEGRID_DEFAULT_EMERGENCY_ID o slug por defecto."),
  emergencySlug: z
    .string()
    .optional()
    .describe("Slug de la emergencia. Si se omite se usa RESPONSEGRID_DEFAULT_EMERGENCY_SLUG."),
};

async function resolveEmergencyId(
  context: AgentContext,
  input: { emergencyId?: string; emergencySlug?: string },
): Promise<string> {
  if (input.emergencyId) {
    return input.emergencyId;
  }

  const slug = input.emergencySlug ?? context.account.emergencySlug;

  const emergency = await context.apiClient.request<{ id: string }>(
    "GET",
    `/emergencies/by-slug/${encodeURIComponent(slug)}`,
  );

  return emergency.id;
}

function getContext(runContext?: RunContext<AgentContext>): AgentContext {
  const context = runContext?.context;

  if (!context?.apiClient) {
    throw new Error("No hay cliente de ResponseGrid disponible en el contexto.");
  }

  return context;
}

function asPrettyJson(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

// ponytail: gate de autorización a nivel de tool. La API de ResponseGrid es la fuente de verdad
// de permisos por rol; esto solo evita que un chat de Telegram sin login use el token del
// service account para escrituras o datos privados. Si se necesitan roles más finos, mover esta
// lógica a la propia API.
function requireAuth(context: AgentContext): void {
  if (!context.authenticated) {
    throw new Error(
      "Esta acción requiere que el usuario esté autenticado. Usa la tool rg_request_user_login para pedirle que inicie sesión antes de continuar.",
    );
  }
}

export const rgGetApiIdentity = tool({
  name: "rg_get_api_identity",
  description:
    "Comprueba la identidad de la API key o token del usuario autenticado en ResponseGrid. Útil para verificar los permisos y rol del bot o del usuario activo.",
  parameters: z.object({}),
  execute: async (_input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const client = context.apiClient as any;
    if (client.authMode === "bearer") {
      const result = await context.apiClient.request("GET", "/auth/me");
      return asPrettyJson(result);
    } else {
      const result = await context.apiClient.request("GET", "/service-accounts/me");
      return asPrettyJson(result);
    }
  },
});

export const rgListEmergencies = tool({
  name: "rg_list_emergencies",
  description:
    "Lista las emergencias activas de ResponseGrid. Úsala si el usuario no sabe el identificador o slug de la emergencia.",
  parameters: z.object({}),
  execute: async (_input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const result = await context.apiClient.request("GET", "/emergencies");
    return asPrettyJson(result);
  },
});

export const rgGetEmergencyBySlug = tool({
  name: "rg_get_emergency_by_slug",
  description: "Obtiene una emergencia de ResponseGrid por su slug público.",
  parameters: z.object({
    slug: z.string().describe("Slug de la emergencia, por ejemplo terremoto-venezuela-2026."),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const result = await context.apiClient.request(
      "GET",
      `/emergencies/by-slug/${encodeURIComponent(input.slug)}`,
    );
    return asPrettyJson(result);
  },
});

export const rgListPublicResources = tool({
  name: "rg_list_public_resources",
  description:
    "Busca/lista recursos publicados de una emergencia: puntos de acopio, almacenes, transporte, proveedores, espacios, etc. Permite filtros por texto, categoría y país.",
  parameters: z.object({
    ...emergencyRefSchema,
    q: z.string().optional().describe("Búsqueda libre por nombre, dirección o ciudad."),
    category: z.string().optional().describe("Slug de categoría, por ejemplo water, food, medical."),
    country: z.string().optional().describe("Código ISO alpha-2, por ejemplo VE o ES."),
    page: z.number().int().positive().optional().default(1),
    limit: z.number().int().positive().max(100).optional().default(10),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request<any>(
      "GET",
      `/emergencies/${emergencyId}/public/resources`,
      undefined,
      {
        q: input.q,
        category: input.category,
        country: input.country,
        page: input.page,
        limit: input.limit,
      },
    );
    if (result && context) {
      const items = Array.isArray(result) ? result : (result.results || result.items || []);
      context.selectableResources = items.map((r: any) => ({
        id: r.id,
        name: r.name,
      }));
    }
    return asPrettyJson(result);
  },
});

export const rgFindNearbyResources = tool({
  name: "rg_find_nearby_resources",
  description:
    "Busca recursos públicos cerca de unas coordenadas GPS dentro de una emergencia, ordenados por distancia.",
  parameters: z.object({
    ...emergencyRefSchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius: z.number().positive().max(100000).describe("Radio en metros, máximo 100000."),
    limit: z.number().int().positive().max(100).optional().default(20),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request<any>(
      "GET",
      `/emergencies/${emergencyId}/public/resources/nearby`,
      undefined,
      {
        lat: input.lat,
        lng: input.lng,
        radius: input.radius,
        limit: input.limit,
      },
    );
    if (result && context) {
      const items = Array.isArray(result) ? result : (result.results || result.items || []);
      context.selectableResources = items.map((r: any) => ({
        id: r.id,
        name: r.name,
      }));
    }
    return asPrettyJson(result);
  },
});

export const rgGetPublicResource = tool({
  name: "rg_get_public_resource",
  description: "Obtiene el detalle público de un recurso publicado por id.",
  parameters: z.object({
    ...emergencyRefSchema,
    resourceId: z.string().uuid(),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request(
      "GET",
      `/emergencies/${emergencyId}/public/resources/${input.resourceId}`,
    );
    return asPrettyJson(result);
  },
});

export const rgGetResourceFacets = tool({
  name: "rg_get_resource_facets",
  description:
    "Obtiene facetas públicas de recursos visibles por categoría y país para ayudar a filtrar búsquedas.",
  parameters: z.object({ ...emergencyRefSchema }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request(
      "GET",
      `/emergencies/${emergencyId}/public/resources/facets`,
    );
    return asPrettyJson(result);
  },
});

export const rgListMyManagedResources = tool({
  name: "rg_list_my_managed_resources",
  description:
    "Lista los recursos que el usuario o service account autenticado gestiona en cualquier emergencia.",
  parameters: z.object({}),
  execute: async (_input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request<any>("GET", "/resources/mine");
    if (Array.isArray(result) && context) {
      context.selectableResources = result.map((r: any) => ({
        id: r.id,
        name: r.name,
      }));
    }
    return asPrettyJson(result);
  },
});

export const rgRegisterResource = tool({
  name: "rg_register_resource",
  description:
    "Registra un recurso en una emergencia: punto de acopio, almacén, transporte, proveedor, local, etc. Para usar API key como integración, incluye author si registras en nombre de un tercero.",
  parameters: z.object({
    ...emergencyRefSchema,
    type: resourceTypeSchema,
    name: z.string().min(2),
    location: locationSchema,
    description: z.string().optional(),
    ownerOrganizationId: z.string().uuid().optional(),
    contact: z.string().optional(),
    schedule: z.string().optional(),
    manager: z.string().optional(),
    accepts: z.array(z.string()).optional(),
    country: z.string().optional().describe("Código ISO alpha-2, por ejemplo VE o ES."),
    city: z.string().optional(),
    isFinalRecipient: z.boolean().optional(),
    recipientType: z.string().optional().describe("hospital, shelter, school, etc."),
    items: z.array(supplyLineSchema).optional(),
    author: authorSchema.optional(),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const emergencyId = await resolveEmergencyId(context, input);
    const { emergencyId: _eid, emergencySlug: _slug, ...payload } = input;
    const result = await context.apiClient.request(
      "POST",
      `/emergencies/${emergencyId}/resources`,
      payload,
    );
    return asPrettyJson(result);
  },
});

export const rgGetResourceInventory = tool({
  name: "rg_get_resource_inventory",
  description:
    "Lee el inventario declarado completo de un recurso/punto. Requiere ser owner o coordinador.",
  parameters: z.object({
    resourceId: z.string().uuid(),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request(
      "GET",
      `/resources/${input.resourceId}/inventory`,
    );
    return asPrettyJson(result);
  },
});

export const rgUpdateResourceInventory = tool({
  name: "rg_update_resource_inventory",
  description:
    "Reemplaza el inventario declarado completo de un recurso. Acción de escritura: confirma con el usuario antes de usarla si el cambio no está claro.",
  parameters: z.object({
    resourceId: z.string().uuid(),
    items: z.array(supplyLineSchema),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request(
      "PUT",
      `/resources/${input.resourceId}/inventory`,
      { items: input.items },
    );
    return asPrettyJson(result);
  },
});

export const rgRecordInventoryEntry = tool({
  name: "rg_record_inventory_entry",
  description:
    "Registra una entrada manual de inventario recibida en un punto. Útil para 'hemos recibido 20 cajas de agua'.",
  parameters: z.object({
    resourceId: z.string().uuid(),
    items: z.array(supplyLineSchema).min(1),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request(
      "POST",
      `/resources/${input.resourceId}/inventory-entries`,
      { items: input.items },
    );
    return asPrettyJson(result);
  },
});

export const rgUpdateResourceStatus = tool({
  name: "rg_update_resource_status",
  description:
    "Actualiza el estado operativo público de un recurso: active, saturated, paused o closed. Pide confirmación antes de cerrar o pausar.",
  parameters: z.object({
    resourceId: z.string().uuid(),
    status: resourceStatusSchema,
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request(
      "POST",
      `/resources/${input.resourceId}/status`,
      { status: input.status },
    );
    return asPrettyJson(result);
  },
});

export const rgListPublicNeeds = tool({
  name: "rg_list_public_needs",
  description:
    "Lista necesidades validadas y públicas de una emergencia, con filtros por categoría, prioridad o recurso vinculado.",
  parameters: z.object({
    ...emergencyRefSchema,
    category: categorySchema.optional(),
    priority: prioritySchema.optional(),
    resourceId: z.string().uuid().optional(),
    limit: z.number().int().positive().max(100).optional().default(20),
    offset: z.number().int().nonnegative().optional().default(0),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request(
      "GET",
      `/emergencies/${emergencyId}/public/needs`,
      undefined,
      {
        category: input.category,
        priority: input.priority,
        resourceId: input.resourceId,
        limit: input.limit,
        offset: input.offset,
      },
    );
    return asPrettyJson(result);
  },
});

export const rgFindNearbyNeeds = tool({
  name: "rg_find_nearby_needs",
  description:
    "Lista necesidades validadas cerca de unas coordenadas GPS, ordenadas por distancia.",
  parameters: z.object({
    ...emergencyRefSchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius: z.number().positive().max(100000),
    limit: z.number().int().positive().max(100).optional().default(20),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request(
      "GET",
      `/emergencies/${emergencyId}/public/needs/nearby`,
      undefined,
      {
        lat: input.lat,
        lng: input.lng,
        radius: input.radius,
        limit: input.limit,
      },
    );
    return asPrettyJson(result);
  },
});

export const rgCreateNeed = tool({
  name: "rg_create_need",
  description:
    "Crea una necesidad en una emergencia. Requiere autenticación. Si se usa API key de integración en nombre de un tercero, incluye author.",
  parameters: z.object({
    ...emergencyRefSchema,
    title: z.string().min(2),
    description: z.string().optional(),
    location: locationSchema,
    priority: prioritySchema,
    requesterOrganizationId: z.string().uuid().optional(),
    items: z.array(supplyLineSchema).min(1),
    requiredSkill: z
      .enum(["driving", "medical", "logistics", "cooking", "languages", "admin", "general"])
      .optional(),
    skillSpecialty: z.string().optional(),
    requestedCount: z.number().int().positive().optional(),
    resourceId: z.string().uuid().optional(),
    author: authorSchema.optional(),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const emergencyId = await resolveEmergencyId(context, input);
    const { emergencyId: _eid, emergencySlug: _slug, ...payload } = input;
    const result = await context.apiClient.request(
      "POST",
      `/emergencies/${emergencyId}/needs`,
      payload,
    );
    return asPrettyJson(result);
  },
});

export const rgListNeedQueue = tool({
  name: "rg_list_need_queue",
  description:
    "Lista la cola de necesidades pendientes de una emergencia. Requiere rol de coordinador.",
  parameters: z.object({
    ...emergencyRefSchema,
    category: categorySchema.optional(),
    priority: prioritySchema.optional(),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const emergencyId = await resolveEmergencyId(context, input);
    const result = await context.apiClient.request(
      "GET",
      `/emergencies/${emergencyId}/needs/queue`,
      undefined,
      {
        category: input.category,
        priority: input.priority,
      },
    );
    return asPrettyJson(result);
  },
});

export const rgValidateNeed = tool({
  name: "rg_validate_need",
  description:
    "Valida una necesidad pendiente. Acción sensible reservada a coordinadores; pide confirmación si hay ambigüedad.",
  parameters: z.object({
    needId: z.string().uuid(),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request("POST", `/needs/${input.needId}/validate`);
    return asPrettyJson(result);
  },
});

export const rgGetNotifications = tool({
  name: "rg_get_notifications",
  description: "Obtiene las notificaciones in-app del usuario autenticado.",
  parameters: z.object({}),
  execute: async (_input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    requireAuth(context);
    const result = await context.apiClient.request("GET", "/notifications/mine");
    return asPrettyJson(result);
  },
});

export const rgRequestUserLogin = tool({
  name: "rg_request_user_login",
  description:
    "Solicita o resuelve el inicio de sesión del usuario. Si ya hay un teléfono verificado disponible, intenta autenticarlo directamente contra ResponseGrid. Úsala cuando una llamada devuelva 401 Unauthorized o el usuario quiera identificarse.",
  parameters: z.object({}),
  execute: async (_input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);

    if (!context.verifiedPhone) {
      context.showLoginButton = true;
      return "Se ha solicitado el inicio de sesión. Muestra un mensaje al usuario indicándole que presione el botón 'Compartir mi teléfono 📱' que ha aparecido en su teclado para autenticarse.";
    }

    try {
      const result = await trustedAuthClient.loginByPhone(context.account, context.verifiedPhone);
      context.authenticated = true;
      context.authenticatedToken = result.accessToken;
      return `Autenticado con éxito como ${result.user.name} (${result.user.email}).`;
    } catch (error) {
      if (error instanceof PhoneNotFoundError) {
        return "No existe ninguna cuenta de ResponseGrid con este teléfono. Pide al usuario su nombre completo y su email, muéstrale que debe aceptar los términos y la política de privacidad de ResponseGrid, y pídele que confirme explícitamente que los acepta. En cuanto tengas los tres datos y la confirmación explícita, llama a la tool rg_register_by_phone.";
      }
      throw error;
    }
  },
});

export const rgRegisterByPhone = tool({
  name: "rg_register_by_phone",
  description:
    "Da de alta una cuenta nueva de ResponseGrid a partir del teléfono ya verificado del usuario, cuando rg_request_user_login ha respondido que no existe cuenta. Requiere que el usuario haya confirmado explícitamente que acepta los términos y la política de privacidad antes de llamarla.",
  parameters: z.object({
    name: z.string().min(2).describe("Nombre completo del usuario."),
    email: z.string().email().describe("Email del usuario."),
    acceptedTerms: z
      .boolean()
      .describe("true solo si el usuario ha confirmado explícitamente que acepta términos y privacidad."),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);

    if (!context.verifiedPhone) {
      throw new Error("No hay un teléfono verificado en este chat; no se puede dar de alta.");
    }

    if (!input.acceptedTerms) {
      return "No puedo crear la cuenta sin que el usuario confirme explícitamente que acepta los términos y la política de privacidad. Pídeselo de nuevo antes de reintentar.";
    }

    try {
      const result = await trustedAuthClient.registerByPhone(context.account, {
        phone: context.verifiedPhone,
        name: input.name,
        email: input.email,
      });
      context.authenticated = true;
      context.authenticatedToken = result.accessToken;
      return `Cuenta creada y autenticada con éxito como ${result.user.name} (${result.user.email}).`;
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        return "Ya existe una cuenta de ResponseGrid con ese email. Pide al usuario un email distinto.";
      }
      throw error;
    }
  },
});

export const rgGeocode = tool({
  name: "rg_geocode",
  description:
    "Obtiene las coordenadas GPS (latitud y longitud) y la dirección normalizada a partir de un texto libre de dirección o lugar (por ejemplo: 'Calle Mayor 1, Madrid'). Úsala para obtener las coordenadas si el usuario te da una dirección pero faltan las coordenadas.",
  parameters: z.object({
    q: z.string().describe("Dirección, lugar o coordenadas a geolocalizar (por ejemplo: 'Calle Real de Arganda 7, Madrid')."),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const result = await context.apiClient.request(
      "GET",
      "/geocode",
      undefined,
      {
        q: input.q,
      },
    );
    return asPrettyJson(result);
  },
});

export const rgSearchSupplies = tool({
  name: "rg_search_supplies",
  description:
    "Busca en el catálogo central de suministros/productos estandarizados (supplies) de ResponseGrid. Soporta multiidioma (pasa el 'locale' adecuado según el idioma en el que hable el usuario).",
  parameters: z.object({
    q: z.string().optional().describe("Texto libre para buscar en el catálogo (por ejemplo: 'agua', 'colchón', 'gasas')."),
    categorySlug: z.string().optional().describe("Filtrar por slug de categoría (por ejemplo: 'water', 'shelter', 'medical_supplies', 'medicines')."),
    locale: z.string().optional().describe("Código de idioma para la búsqueda y nombres resultantes (por ejemplo: 'es' para español, 'en' para inglés)."),
    limit: z.number().int().positive().max(50).optional().default(20),
  }),
  execute: async (input, runContext?: RunContext<AgentContext>) => {
    const context = getContext(runContext);
    const result = await context.apiClient.request(
      "GET",
      "/supplies",
      undefined,
      {
        q: input.q,
        categorySlug: input.categorySlug,
        locale: input.locale,
        limit: input.limit,
      },
    );
    return asPrettyJson(result);
  },
});

export const agentTools = [
  rgGetApiIdentity,
  rgListEmergencies,
  rgGetEmergencyBySlug,
  rgListPublicResources,
  rgFindNearbyResources,
  rgGetPublicResource,
  rgGetResourceFacets,
  rgListMyManagedResources,
  rgRegisterResource,
  rgGetResourceInventory,
  rgUpdateResourceInventory,
  rgRecordInventoryEntry,
  rgUpdateResourceStatus,
  rgListPublicNeeds,
  rgFindNearbyNeeds,
  rgCreateNeed,
  rgListNeedQueue,
  rgValidateNeed,
  rgGetNotifications,
  rgRequestUserLogin,
  rgRegisterByPhone,
  rgGeocode,
  rgSearchSupplies,
];
