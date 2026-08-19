import * as ar from "./ar";
import * as en from "./en";
import { getLocale } from "./store";

export function currentCatalog() {
  return getLocale() === "en" ? en : ar;
}

export function currentT() {
  return currentCatalog().T;
}
