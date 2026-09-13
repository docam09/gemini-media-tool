export const DEFAULT_MODEL = "gemini-3.6-flash";

export function resolveModel(value = "") {
  const model = value.trim().replace(/^models\//, "") || DEFAULT_MODEL;
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error("Tên model không hợp lệ. Nhập mã model, ví dụ gemini-3.6-flash.");
  }
  return model === "gemini-2.5-flash" ? DEFAULT_MODEL : model;
}
