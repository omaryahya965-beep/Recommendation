import { api, ClientError } from "./api";
import { currentT } from "./i18n/messages";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".zip",
];

export const FILE_INPUT_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.join(",");
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export type UploadPurpose = "evidence" | "response";

type SignResponse = {
  direct_upload: boolean;
  cloud_name?: string;
  api_key?: string;
  timestamp?: number;
  signature?: string;
  folder?: string;
  resource_type?: string;
  max_bytes?: number;
  /** Exact Cloudinary fields that were hashed. Prefer these over hardcoded flags. */
  fields?: Record<string, string>;
};

type CloudinaryUploadResult = {
  public_id?: string;
  format?: string;
  resource_type?: string;
  error?: { message?: string };
};

export function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export function validateSelectedFile(file: File, maxBytes: number): string | null {
  const T = currentT();
  const ext = fileExtension(file.name);
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return T.evidenceRegister.disallowedType;
  }
  if (file.size > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return T.common.fileTooLarge.replace("{mb}", String(mb));
  }
  return null;
}

function storedNameFromCloudinary(uploaded: CloudinaryUploadResult, resourceType: string): string {
  const id = uploaded.public_id || "";
  const fmt = (uploaded.format || "").toLowerCase();
  if (resourceType === "raw" || uploaded.resource_type === "raw") return id;
  if (fmt && !id.toLowerCase().endsWith(`.${fmt}`)) return `${id}.${fmt}`;
  return id;
}

export async function prepareFileSubmission(options: {
  file: File;
  purpose: UploadPurpose;
  fileFieldName: string;
  extraFields?: Record<string, string>;
}): Promise<{ formData?: FormData; body?: Record<string, unknown> }> {
  const sign = await api<SignResponse>("/api/media/sign/", {
    method: "POST",
    body: { purpose: options.purpose, filename: options.file.name },
  });
  const maxBytes = sign.max_bytes ?? DEFAULT_MAX_BYTES;
  const invalid = validateSelectedFile(options.file, maxBytes);
  if (invalid) throw new ClientError(invalid);

  if (sign.direct_upload && sign.cloud_name && sign.api_key && sign.signature != null && sign.timestamp != null) {
    const fields = sign.fields ?? {
      timestamp: String(sign.timestamp),
      folder: sign.folder || "",
      use_filename: "true",
      unique_filename: "true",
      overwrite: "false",
    };
    const form = new FormData();
    form.append("file", options.file);
    form.append("api_key", sign.api_key);
    form.append("signature", sign.signature);
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    const resourceType = sign.resource_type || "raw";
    const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloud_name}/${resourceType}/upload`, {
      method: "POST",
      body: form,
    });
    const uploaded = (await res.json().catch(() => ({}))) as CloudinaryUploadResult;
    if (!res.ok || !uploaded.public_id) {
      throw new ClientError(uploaded.error?.message || currentT().common.uploadFailed);
    }
    return {
      body: {
        ...options.extraFields,
        stored_name: storedNameFromCloudinary(uploaded, resourceType),
      },
    };
  }

  const formData = new FormData();
  formData.append(options.fileFieldName, options.file);
  for (const [key, value] of Object.entries(options.extraFields ?? {})) {
    if (value) formData.append(key, value);
  }
  return { formData };
}
