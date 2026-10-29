import { expect, it } from "vitest";

import { presentClassroomCourse } from "./course-outline";

it("lists each course's modules and the lessons inside them", () => {
  const outline = presentClassroomCourse(
    { id: 4 },
    [
      {
        id: 8,
        course: 4,
        title: "Sounds",
        order: 0,
        summary: "First sounds",
      },
    ],
    [
      { id: 21, course: 4, module: 8, title: "The g", order: 0 },
      { id: 22, course: 4, module: null, title: "Welcome", order: 1 },
      { id: 99, course: 5, module: 8, title: "Other course", order: 0 },
    ],
  );
  expect(outline.modules).toEqual([
    {
      id: 8,
      title: "Sounds",
      order: 0,
      summary: "First sounds",
      imageMediaId: null,
      imageUrl: null,
      imageAlt: null,
      lessons: [{ id: 21, title: "The g", order: 0 }],
    },
  ]);
  expect(outline.lessons).toEqual([{ id: 22, title: "Welcome", order: 1 }]);
});
