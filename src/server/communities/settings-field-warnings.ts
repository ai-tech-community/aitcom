export type SettingsFieldWarning = {
  field: string;
  message: string;
};

/**
 * A magazine logo cannot be saved until the community has a magazine.
 * The rest of a settings call still applies.
 */
export function missingMagazineLogoWarning(): SettingsFieldWarning {
  return {
    field: "magazineLogoMediaId",
    message:
      "This community has no magazine yet. Create the magazine before setting its logo. Other settings were saved.",
  };
}
