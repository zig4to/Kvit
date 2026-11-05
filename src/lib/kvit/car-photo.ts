import { createClient } from "@/lib/supabase/client";

// Zasebni bucket s slikami avtov (0005_car_photos.sql). Pot:
// <household_id>/<car_id>/<uuid>.jpg — storage politike dovolijo samo mapo
// lastnega gospodinjstva.
export const CAR_PHOTO_BUCKET = "kvit-avti";

// Zasebni bucket s slikami računov (0011_receipts.sql). Pot:
// <household_id>/<user_id>/<uuid>.jpg — nalaga in briše samo lastnik mape.
export const RECEIPT_BUCKET = "kvit-racuni";

const MAX_SIDE = 1400; // dovolj za glavo avta, ~200–400 kB
const RECEIPT_MAX_SIDE = 2000; // račun mora ostati berljiv

// crypto.randomUUID obstaja le na varnem izvoru (https/localhost), ne pa prek
// http://<IP> v domačem omrežju — getRandomValues je na voljo povsod.
function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Slika s kamere je pogosto 3–8 MB: pomanjšamo jo in shranimo kot JPEG. Če
// brskalnik slike ne zna dekodirati (npr. HEIC), naložimo izvirnik.
async function shrink(file: File, maxSide = MAX_SIDE): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

// Naloži sliko naravnost iz brskalnika (mimo omejitve velikosti server
// action) in vrne pot v bucketu za setCarPhotoAction.
export async function uploadCarPhoto(file: File, householdId: string, carId: string): Promise<string> {
  const blob = await shrink(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
  const path = `${householdId}/${carId}/${randomId()}.${ext.toLowerCase()}`;
  const { error } = await createClient()
    .storage.from(CAR_PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw error;
  return path;
}

// Slika računa ob vnosu → pot v bucketu kvit-racuni za saveEntryAction.
export async function uploadReceipt(file: File, householdId: string, userId: string): Promise<string> {
  const blob = await shrink(file, RECEIPT_MAX_SIDE);
  const ext = blob.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
  const path = `${householdId}/${userId}/${randomId()}.${ext.toLowerCase()}`;
  const { error } = await createClient()
    .storage.from(RECEIPT_BUCKET)
    .upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw error;
  return path;
}

// Odstrani naloženo sliko računa, ki ni bila shranjena (preklic obrazca).
export async function removeReceipt(path: string) {
  await createClient().storage.from(RECEIPT_BUCKET).remove([path]);
}
