import type { Metadata } from "next";
import { CreateThreadForm } from "@/components/forum/create-thread-form";

export const metadata: Metadata = {
  title: "New Thread — Forum — AIT",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">
      <CreateThreadForm />
    </div>
  );
}
