export function getAdminAccess(
  user: { role: string } | null,
  loading: boolean,
): "loading" | "sign-in" | "denied" | "allowed" {
  if (loading) return "loading";
  if (!user) return "sign-in";
  return user.role === "ADMIN" ? "allowed" : "denied";
}
export function validateUploadFile(
  file: { size: number; type: string },
  type: "AUDIO" | "VIDEO",
): string | null {
  if (file.size <= 0) return "This file is empty. Please choose another file.";
  if (file.size > 5 * 1024 ** 3) return "Choose a file smaller than 5 GiB.";
  const allowed =
    type === "VIDEO"
      ? ["video/mp4", "video/webm", "video/quicktime"]
      : ["audio/mpeg", "audio/wav", "audio/flac"];
  if (!allowed.includes(file.type)) return `Choose a supported ${type.toLowerCase()} file.`;
  return null;
}
