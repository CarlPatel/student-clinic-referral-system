const GOOGLE_DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

function isGoogleHost(host: string): boolean {
  return host === "google.com" || host.endsWith(".google.com");
}

export function extractGoogleDriveFileId(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value) return null;

  if (GOOGLE_DRIVE_FILE_ID_PATTERN.test(value) && !value.includes(".")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (!isGoogleHost(host)) {
      return null;
    }

    const idFromQuery = parsed.searchParams.get("id");
    if (idFromQuery && GOOGLE_DRIVE_FILE_ID_PATTERN.test(idFromQuery)) {
      return idFromQuery;
    }

    const pathMatch = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
    if (pathMatch?.[1] && GOOGLE_DRIVE_FILE_ID_PATTERN.test(pathMatch[1])) {
      return pathMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

export function buildGoogleDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function buildGoogleDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function buildGoogleDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}
