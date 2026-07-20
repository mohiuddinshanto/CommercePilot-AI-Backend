import { validateRequiredFields, validateStringLength, validateEmail } from "../../middleware/validation.middleware";

export const createStoreValidation = [
  validateRequiredFields(["storeName", "storeSlug", "currency", "timezone"]),
  validateStringLength("storeName", 3, 100),
  validateStringLength("storeSlug", 3, 100),
  validateEmail("email"),
];
