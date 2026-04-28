import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { buildGoogleDriveViewUrl, extractGoogleDriveFileId } from "@/lib/googleDrive";
import { getSessionOptions } from "@/lib/auth/session";
import {
  canManageClinic,
  canManageClinicService,
  createClinicDocument,
  createClinicServiceDocument,
  listClinicDocuments,
  listClinicServiceDocuments,
  listManageableClinics,
  listManageableClinicServices,
  saveClinicDocumentOrder,
  saveClinicServiceDocumentOrder,
  updateClinicDocument,
  updateClinicServiceDocument
} from "@/lib/dataSource/postgres";
import type { ClinicOption, ClinicServiceOption, FormDocument, UserRole } from "@/lib/types";

type DocumentsResponse = {
  ok: boolean;
  message?: string;
  clinicOptions?: ClinicOption[];
  options?: ClinicServiceOption[];
  documents?: FormDocument[];
  document?: FormDocument;
};

const validDocTypes = ["form", "auth", "insurance"] as const;
type ValidDocType = (typeof validDocTypes)[number];
type DocumentScope = "clinic" | "clinic_service";

function isDocType(value: unknown): value is ValidDocType {
  return typeof value === "string" && validDocTypes.includes(value as ValidDocType);
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseScope(value: unknown): DocumentScope {
  return value === "clinic" ? "clinic" : "clinic_service";
}

async function requireClinicAccess(clinicId: unknown, role: UserRole, clinicKey?: string | null) {
  if (typeof clinicId !== "string" || !clinicId.trim()) {
    return { ok: false as const, status: 400, message: "Clinic is required.", clinicId: "" };
  }

  const normalizedClinicId = clinicId.trim();
  const canManage = await canManageClinic(normalizedClinicId, role, clinicKey);
  if (!canManage) {
    return {
      ok: false as const,
      status: 403,
      message: "You can only manage forms for your clinic.",
      clinicId: normalizedClinicId
    };
  }

  return { ok: true as const, clinicId: normalizedClinicId };
}

async function requireClinicServiceAccess(clinicServiceId: unknown, role: UserRole, clinicKey?: string | null) {
  if (typeof clinicServiceId !== "string" || !clinicServiceId.trim()) {
    return { ok: false as const, status: 400, message: "Clinic service is required.", clinicServiceId: "" };
  }

  const normalizedClinicServiceId = clinicServiceId.trim();
  const canManage = await canManageClinicService(normalizedClinicServiceId, role, clinicKey);
  if (!canManage) {
    return {
      ok: false as const,
      status: 403,
      message: "You can only manage forms for clinic services assigned to your clinic.",
      clinicServiceId: normalizedClinicServiceId
    };
  }

  return { ok: true as const, clinicServiceId: normalizedClinicServiceId };
}

async function handler(req: NextApiRequest, res: NextApiResponse<DocumentsResponse>) {
  if (!req.session.isLoggedIn) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const role = req.session.role || "clinic_member";
  if (role !== "clinic_admin" && role !== "master_admin") {
    return res.status(403).json({ ok: false, message: "Clinic admin access required" });
  }

  try {
    if (req.method === "GET") {
      const scope = parseScope(req.query.scope);
      const [clinicOptions, options] = await Promise.all([
        listManageableClinics(role, req.session.clinicKey),
        listManageableClinicServices(role, req.session.clinicKey)
      ]);
      let documents: FormDocument[] = [];

      if (scope === "clinic") {
        const requestedClinicId = typeof req.query.clinicId === "string" ? req.query.clinicId : undefined;
        const clinicId = requestedClinicId ?? clinicOptions[0]?.id;

        if (clinicId) {
          const access = await requireClinicAccess(clinicId, role, req.session.clinicKey);
          if (!access.ok) {
            return res.status(access.status).json({ ok: false, message: access.message });
          }

          documents = await listClinicDocuments(access.clinicId);
        }

        return res.status(200).json({ ok: true, clinicOptions, options, documents });
      }

      const requestedClinicServiceId = typeof req.query.clinicServiceId === "string" ? req.query.clinicServiceId : undefined;
      const clinicServiceId = requestedClinicServiceId ?? options[0]?.id;

      if (clinicServiceId) {
        const access = await requireClinicServiceAccess(clinicServiceId, role, req.session.clinicKey);
        if (!access.ok) {
          return res.status(access.status).json({ ok: false, message: access.message });
        }

        documents = await listClinicServiceDocuments(access.clinicServiceId);
      }

      return res.status(200).json({ ok: true, clinicOptions, options, documents });
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as {
        scope?: DocumentScope;
        clinicId?: string;
        clinicServiceId?: string;
        docName?: string;
        docType?: string;
        docDescription?: string;
        url?: string;
        googleDriveFileId?: string;
      };
      const scope = parseScope(body.scope);

      const docName = parseOptionalString(body.docName);
      const docDescription = parseOptionalString(body.docDescription);
      const url = parseOptionalString(body.url);
      const fileIdFromUrl = extractGoogleDriveFileId(url);
      const fileIdFromField = extractGoogleDriveFileId(body.googleDriveFileId);
      const googleDriveFileId = fileIdFromField ?? fileIdFromUrl;

      if (!docName || !isDocType(body.docType)) {
        return res.status(400).json({ ok: false, message: "Document name and type are required." });
      }

      if (url && !fileIdFromUrl) {
        return res.status(400).json({ ok: false, message: "Enter a valid Google Drive link." });
      }

      if (body.googleDriveFileId && !fileIdFromField) {
        return res.status(400).json({ ok: false, message: "Enter a valid Google Drive file ID." });
      }

      if (scope === "clinic") {
        const access = await requireClinicAccess(body.clinicId, role, req.session.clinicKey);
        if (!access.ok) {
          return res.status(access.status).json({ ok: false, message: access.message });
        }

        const document = await createClinicDocument({
          clinicId: access.clinicId,
          docName,
          docType: body.docType,
          docDescription,
          url: url ?? (googleDriveFileId ? buildGoogleDriveViewUrl(googleDriveFileId) : null),
          googleDriveFileId
        });
        const documents = await listClinicDocuments(access.clinicId);
        return res.status(201).json({ ok: true, document, documents });
      }

      const access = await requireClinicServiceAccess(body.clinicServiceId, role, req.session.clinicKey);
      if (!access.ok) {
        return res.status(access.status).json({ ok: false, message: access.message });
      }

      const document = await createClinicServiceDocument({
        clinicServiceId: access.clinicServiceId,
        docName,
        docType: body.docType,
        docDescription,
        url: url ?? (googleDriveFileId ? buildGoogleDriveViewUrl(googleDriveFileId) : null),
        googleDriveFileId
      });
      const documents = await listClinicServiceDocuments(access.clinicServiceId);

      return res.status(201).json({ ok: true, document, documents });
    }

    if (req.method === "PATCH") {
      const body = (req.body ?? {}) as {
        scope?: DocumentScope;
        clinicId?: string;
        clinicServiceId?: string;
        orderedDocumentIds?: unknown[];
        documentId?: number | string;
        docName?: string;
        docType?: string;
        docDescription?: string;
        url?: string;
        googleDriveFileId?: string;
      };
      const scope = parseScope(body.scope);

      if (body.documentId != null) {
        const documentId = typeof body.documentId === "number" ? body.documentId : Number.parseInt(String(body.documentId), 10);
        const docName = parseOptionalString(body.docName);
        const docDescription = parseOptionalString(body.docDescription);
        const url = parseOptionalString(body.url);
        const fileIdFromUrl = extractGoogleDriveFileId(url);
        const fileIdFromField = extractGoogleDriveFileId(body.googleDriveFileId);
        const googleDriveFileId = fileIdFromField ?? fileIdFromUrl;

        if (!Number.isInteger(documentId)) {
          return res.status(400).json({ ok: false, message: "Document ID is required." });
        }

        if (!docName || !isDocType(body.docType)) {
          return res.status(400).json({ ok: false, message: "Document name and type are required." });
        }

        if (url && !fileIdFromUrl) {
          return res.status(400).json({ ok: false, message: "Enter a valid Google Drive link." });
        }

        if (body.googleDriveFileId && !fileIdFromField) {
          return res.status(400).json({ ok: false, message: "Enter a valid Google Drive file ID." });
        }

        if (scope === "clinic") {
          const access = await requireClinicAccess(body.clinicId, role, req.session.clinicKey);
          if (!access.ok) {
            return res.status(access.status).json({ ok: false, message: access.message });
          }

          const document = await updateClinicDocument({
            id: documentId,
            clinicId: access.clinicId,
            docName,
            docType: body.docType,
            docDescription,
            url: url ?? (googleDriveFileId ? buildGoogleDriveViewUrl(googleDriveFileId) : null),
            googleDriveFileId
          });
          const documents = await listClinicDocuments(access.clinicId);
          return res.status(200).json({ ok: true, document, documents });
        }

        const access = await requireClinicServiceAccess(body.clinicServiceId, role, req.session.clinicKey);
        if (!access.ok) {
          return res.status(access.status).json({ ok: false, message: access.message });
        }

        const document = await updateClinicServiceDocument({
          id: documentId,
          clinicServiceId: access.clinicServiceId,
          docName,
          docType: body.docType,
          docDescription,
          url: url ?? (googleDriveFileId ? buildGoogleDriveViewUrl(googleDriveFileId) : null),
          googleDriveFileId
        });
        const documents = await listClinicServiceDocuments(access.clinicServiceId);
        return res.status(200).json({ ok: true, document, documents });
      }

      const orderedDocumentIds = Array.isArray(body.orderedDocumentIds)
        ? body.orderedDocumentIds.map((id) => (typeof id === "number" ? id : Number.parseInt(String(id), 10)))
        : [];

      if (orderedDocumentIds.length === 0 || orderedDocumentIds.some((id) => !Number.isInteger(id))) {
        return res.status(400).json({ ok: false, message: "A complete document order is required." });
      }

      if (scope === "clinic") {
        const access = await requireClinicAccess(body.clinicId, role, req.session.clinicKey);
        if (!access.ok) {
          return res.status(access.status).json({ ok: false, message: access.message });
        }

        await saveClinicDocumentOrder(access.clinicId, orderedDocumentIds);
        const documents = await listClinicDocuments(access.clinicId);
        return res.status(200).json({ ok: true, documents });
      }

      const access = await requireClinicServiceAccess(body.clinicServiceId, role, req.session.clinicKey);
      if (!access.ok) {
        return res.status(access.status).json({ ok: false, message: access.message });
      }

      await saveClinicServiceDocumentOrder(access.clinicServiceId, orderedDocumentIds);
      const documents = await listClinicServiceDocuments(access.clinicServiceId);
      return res.status(200).json({ ok: true, documents });
    }

    res.setHeader("Allow", "GET,POST,PATCH");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return res.status(400).json({ ok: false, message });
  }
}

export default withIronSessionApiRoute(handler, getSessionOptions());
