import { expect, it } from "vitest";

import {
  missingMagazineLogoWarning,
  unknownMagazineLogoWarning,
} from "./settings-field-warnings";

it("names the magazine logo field and keeps the rest of the save", () => {
  expect(missingMagazineLogoWarning()).toEqual({
    field: "magazineLogoMediaId",
    message:
      "This community has no magazine yet. Create the magazine before setting its logo. Other settings were saved.",
  });
});

it("warns on an unknown magazine logo id and keeps the rest of the save", () => {
  expect(unknownMagazineLogoWarning()).toEqual({
    field: "magazineLogoMediaId",
    message:
      "Unknown image. Upload it with upload-image first. Other settings were saved.",
  });
});
