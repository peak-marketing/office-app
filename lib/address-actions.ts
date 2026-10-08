"use server";

import { requireUser } from "./auth";
import { buildingInfo, searchAddress, searchAddressDetails, type AddressHit } from "./address";

export async function lookupAddress(q: string) {
  const user = await requireUser();
  return searchAddress(q, user.id);
}

export async function lookupBuilding(hit: AddressHit, dong: string, ho: string) {
  const user = await requireUser();
  return buildingInfo(hit, dong.trim().slice(0, 20), ho.trim().slice(0, 20), user.id);
}

export async function lookupAddressDetails(hit: AddressHit, mode: "dong" | "floorho", dong = "") {
  const user = await requireUser();
  return searchAddressDetails(hit, mode, dong, user.id);
}
