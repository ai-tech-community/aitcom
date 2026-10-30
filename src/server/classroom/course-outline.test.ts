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

it("groups lessons when course and module ids arrive as numeric strings", () => {
  const outline = presentClassroomCourse(
    { id: 14 },
    [
      {
        id: 5,
        course: "14" as unknown as number,
        title: "Sounds",
        order: 0,
        summary: null,
      },
    ],
    [
      {
        id: 26,
        course: "14" as unknown as number,
        module: "5" as unknown as number,
        title: "A0.1 Sounds and spelling",
        order: 0,
      },
    ],
  );
  expect(outline.modules[0]?.lessons).toEqual([
    { id: 26, title: "A0.1 Sounds and spelling", order: 0 },
  ]);
  expect(outline.lessons).toEqual([]);
});
