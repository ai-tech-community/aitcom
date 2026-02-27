import type { Metadata } from "next";
import { CreateThreadForm } from "@/components/forum/create-thread-form";

export const metadata: Metadata = {
  title: "New Thread — Forum — AIT",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <CreateThreadForm />
    </div>
  );
}
